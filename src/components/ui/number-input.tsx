import * as React from "react";
import { cn } from "@/lib/utils";

interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** The step value for increment/decrement (default: 1) */
  step?: number | string;
}

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, step = 1, min, max, value, onChange, disabled, ...props }, ref) => {
    const stepNum = typeof step === "string" ? parseFloat(step) || 1 : step;
    const minNum = min !== undefined ? (typeof min === "string" ? parseFloat(min) : min) : undefined;
    const maxNum = max !== undefined ? (typeof max === "string" ? parseFloat(max) : max) : undefined;

    const handleStep = (direction: 1 | -1) => {
      if (disabled) return;
      const currentVal = parseFloat(String(value || "0")) || 0;
      let newVal = parseFloat((currentVal + stepNum * direction).toFixed(10));

      if (minNum !== undefined && newVal < minNum) newVal = minNum;
      if (maxNum !== undefined && newVal > maxNum) newVal = maxNum;

      // Determine decimal places from step
      const decimals = stepNum.toString().split(".")[1]?.length || 0;
      const formatted = decimals > 0 ? newVal.toFixed(decimals) : String(newVal);

      // Synthesize a change event
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;

      const inputEl =
        ref && "current" in ref
          ? ref.current
          : document.querySelector<HTMLInputElement>(
              `input[name="${props.name}"]`
            );

      if (inputEl && nativeInputValueSetter) {
        nativeInputValueSetter.call(inputEl, formatted);
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (onChange) {
        // Fallback: create a synthetic event
        const syntheticEvent = {
          target: { value: formatted },
          currentTarget: { value: formatted },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      }
    };

    return (
      <div className="relative group">
        <input
          type="number"
          ref={ref}
          step={step}
          min={min}
          max={max}
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pr-9 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            className,
          )}
          {...props}
        />
        {!disabled && (
          <div className="absolute right-0 top-0 bottom-0 flex flex-col w-7 border-l border-input rounded-r-md overflow-hidden opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
            {/* Up button */}
            <button
              type="button"
              tabIndex={-1}
              aria-label="Increment"
              onClick={() => handleStep(1)}
              className="flex-1 flex items-center justify-center bg-secondary/80 hover:bg-accent text-muted-foreground hover:text-primary transition-colors duration-100 border-b border-input"
            >
              <svg
                width="10"
                height="6"
                viewBox="0 0 10 6"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 5L5 1L9 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {/* Down button */}
            <button
              type="button"
              tabIndex={-1}
              aria-label="Decrement"
              onClick={() => handleStep(-1)}
              className="flex-1 flex items-center justify-center bg-secondary/80 hover:bg-accent text-muted-foreground hover:text-primary transition-colors duration-100"
            >
              <svg
                width="10"
                height="6"
                viewBox="0 0 10 6"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 1L5 5L9 1"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
    );
  },
);
NumberInput.displayName = "NumberInput";

export { NumberInput };
