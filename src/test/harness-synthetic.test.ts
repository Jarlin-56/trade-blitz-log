import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error untyped script module
import { ensureTestGridFixture, parseHarnessArgs, verifyExecutableStagingTarget, evaluateValidationResult } from '../../scripts/interactive-capture-harness.mjs';
// @ts-expect-error untyped script module
import { validateStagingUiConfig, ALLOWED_STAGING_REF, FORBIDDEN_PROJECT_REFS } from '../../scripts/staging-utils.mjs';

describe('A11.1-R2 Interactive Capture Harness Synthetic & Decision Logic Tests', () => {
  it('ensureTestGridFixture generates valid calibration pattern without personal data', () => {
    const gridPath = ensureTestGridFixture();
    expect(fs.existsSync(gridPath)).toBe(true);
    const content = fs.readFileSync(gridPath, 'utf8');
    expect(content).toContain('A11.1 Non-Personal Interactive Capture Test Grid');
    expect(content).toContain('BOX 1: NORTH-WEST');
    expect(content).not.toContain('@');
    expect(content).not.toContain('trade-blitz-log');
  });

  describe('parseHarnessArgs', () => {
    it('uses correct default paths when no flags passed', () => {
      const parsed = parseHarnessArgs([]);
      expect(parsed.executable).toContain('win-unpacked');
      expect(parsed.config).toContain('staging-ui-config.json');
      expect(parsed.output).toContain('interactive-capture-report.json');
    });

    it('correctly accepts custom --executable, --config, and --output paths', () => {
      const parsed = parseHarnessArgs([
        '--executable', 'C:/Custom/App.exe',
        '--config', 'C:/Custom/config.json',
        '--output', 'C:/Custom/out.json'
      ]);
      expect(parsed.executable).toBe(path.resolve('C:/Custom/App.exe'));
      expect(parsed.config).toBe(path.resolve('C:/Custom/config.json'));
      expect(parsed.output).toBe(path.resolve('C:/Custom/out.json'));
    });
  });

  describe('validateStagingUiConfig', () => {
    it('accepts valid staging UI config with zero credentials', () => {
      const validConfig = {
        project_ref: ALLOWED_STAGING_REF,
        supabase_url: `https://${ALLOWED_STAGING_REF}.supabase.co`
      };
      expect(validateStagingUiConfig(validConfig)).toBe(true);
    });

    it('rejects forbidden production project ref', () => {
      const badConfig = {
        project_ref: FORBIDDEN_PROJECT_REFS[0],
        supabase_url: `https://${FORBIDDEN_PROJECT_REFS[0]}.supabase.co`
      };
      expect(() => validateStagingUiConfig(badConfig)).toThrow(/UI target validation failed/);
    });

    it('strictly rejects any presence of database credentials or service keys', () => {
      const leakedPasswordConfig = {
        project_ref: ALLOWED_STAGING_REF,
        supabase_url: `https://${ALLOWED_STAGING_REF}.supabase.co`,
        db_password: 'supersecretpassword'
      };
      expect(() => validateStagingUiConfig(leakedPasswordConfig)).toThrow(/SECURITY VIOLATION.*credentials/);

      const leakedServiceRoleConfig = {
        project_ref: ALLOWED_STAGING_REF,
        supabase_url: `https://${ALLOWED_STAGING_REF}.supabase.co`,
        service_role_key: 'eyJh...'
      };
      expect(() => validateStagingUiConfig(leakedServiceRoleConfig)).toThrow(/SECURITY VIOLATION.*credentials/);
    });
  });

  describe('verifyExecutableStagingTarget', () => {
    it('throws error if executable does not exist', () => {
      expect(() => verifyExecutableStagingTarget('C:/NonExistent/App.exe', { project_ref: ALLOWED_STAGING_REF }))
        .toThrow(/Executable not found/);
    });

    it('validates unpacked staging executable asar against allowed staging ref', () => {
      const execPath = path.resolve('release-staging/win-unpacked/Trade Log.exe');
      if (fs.existsSync(execPath)) {
        expect(verifyExecutableStagingTarget(execPath, { project_ref: ALLOWED_STAGING_REF })).toBe(true);
      }
    });
  });

  describe('evaluateValidationResult decision logic', () => {
    const createBaseValidReport = () => ({
      rounds: [
        { round: 1, attached: true, isAllBlack: false, cropWindowLeaked: false, operator_confirmed: true, fingerprint: '100x100:123' },
        { round: 2, attached: true, isAllBlack: false, cropWindowLeaked: false, operator_confirmed: true, fingerprint: '100x100:456' },
        { round: 3, attached: true, isAllBlack: false, cropWindowLeaked: false, operator_confirmed: true, fingerprint: '100x100:789' }
      ] as Array<{
        round: number;
        attached: boolean;
        isAllBlack: boolean;
        cropWindowLeaked: boolean;
        operator_confirmed: boolean;
        fingerprint?: string;
      }>,
      cancel_tests: {
        escape_cancel: 'PASSED',
        micro_drag_cancel: 'PASSED',
        widget_pinned_restore: 'PASSED',
        widget_unpinned_restore: 'PASSED'
      },
      clipboard_paste: 'PASSED',
      operator_visual_confirmation: {
        round1_correct_region: true,
        round2_correct_region: true,
        round3_correct_region: true,
        paste_correct_image: true
      }
    });

    it('returns PASSED and exitCode 0 when all required test cases succeed', () => {
      const report = createBaseValidReport();
      const res = evaluateValidationResult(report);
      expect(res.status).toBe('PASSED');
      expect(res.exitCode).toBe(0);
      expect(res.reasons).toHaveLength(0);
    });

    it('returns FAILED and exitCode 1 when cancel test detects crop window never opened', () => {
      const report = createBaseValidReport();
      report.cancel_tests.escape_cancel = 'FAIL_CROP_NEVER_OPENED';

      const res = evaluateValidationResult(report);
      expect(res.status).toBe('FAILED');
      expect(res.exitCode).toBe(1);
      expect(res.reasons.some((r: string) => r.includes('FAIL_CROP_NEVER_OPENED'))).toBe(true);
    });

    it('returns FAILED and exitCode 1 when operator responds n (rejects region accuracy)', () => {
      const report = createBaseValidReport();
      report.rounds[1].operator_confirmed = false;
      report.operator_visual_confirmation.round2_correct_region = false;

      const res = evaluateValidationResult(report);
      expect(res.status).toBe('FAILED');
      expect(res.exitCode).toBe(1);
      expect(res.reasons.some((r: string) => r.includes('Round 2: operator rejected'))).toBe(true);
    });

    it('returns FAILED and exitCode 1 when paste fails or operator rejects pasted image', () => {
      const reportNotAttached = createBaseValidReport();
      reportNotAttached.clipboard_paste = 'FAIL_NOT_ATTACHED';
      const res1 = evaluateValidationResult(reportNotAttached);
      expect(res1.status).toBe('FAILED');
      expect(res1.exitCode).toBe(1);

      const reportOperatorRejected = createBaseValidReport();
      reportOperatorRejected.clipboard_paste = 'FAIL_REGION_MISMATCH';
      reportOperatorRejected.operator_visual_confirmation.paste_correct_image = false;
      const res2 = evaluateValidationResult(reportOperatorRejected);
      expect(res2.status).toBe('FAILED');
      expect(res2.exitCode).toBe(1);
    });

    it('returns INCOMPLETE and exitCode 2 (nonzero) when required test cases are NOT TESTED', () => {
      const reportIncomplete = createBaseValidReport();
      reportIncomplete.cancel_tests.micro_drag_cancel = 'NOT TESTED';

      const res = evaluateValidationResult(reportIncomplete);
      expect(res.status).toBe('INCOMPLETE');
      expect(res.exitCode).toBe(2);
      expect(res.reasons.some((r: string) => r.includes("Cancel test 'micro_drag_cancel' is NOT TESTED"))).toBe(true);

      const reportMissingRounds = createBaseValidReport();
      reportMissingRounds.rounds.pop(); // only 2 rounds
      const res2 = evaluateValidationResult(reportMissingRounds);
      expect(res2.status).toBe('INCOMPLETE');
      expect(res2.exitCode).toBe(2);
    });

    it('accepts identical image fingerprint if from a new capture round (not stale)', () => {
      // In Round 1 and Round 2, operator crops identical box 1, resulting in same fingerprint
      // Both have attached: true and operator_confirmed: true
      const report = createBaseValidReport();
      report.rounds[0].fingerprint = '240x180:54321';
      report.rounds[1].fingerprint = '240x180:54321'; // same fingerprint from new event

      const res = evaluateValidationResult(report);
      expect(res.status).toBe('PASSED');
      expect(res.exitCode).toBe(0);
    });
  });
});
