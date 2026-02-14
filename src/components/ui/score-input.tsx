import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";

interface ScoreInputProps {
  value: number;
  onChange: (value: number) => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

export const ScoreInput = ({ value, onChange, onIncrement, onDecrement, disabled = false, className = "", compact = false }: ScoreInputProps) => {
  const increment = () => {
    onChange(value + 1);
    onIncrement?.();
  };

  const decrement = () => {
    if (value > 0) {
      onChange(value - 1);
      onDecrement?.();
    }
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-0.5 ${className}`}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-5 w-5 p-0"
          onClick={decrement}
          disabled={disabled || value <= 0}
        >
          <Minus className="h-2.5 w-2.5" />
        </Button>
        <div className="h-5 w-8 flex items-center justify-center bg-primary/10 rounded font-bold text-[10px]">
          {value}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-5 w-5 p-0"
          onClick={increment}
          disabled={disabled}
        >
          <Plus className="h-2.5 w-2.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 w-8 sm:h-9 sm:w-9 p-0"
        onClick={decrement}
        disabled={disabled || value <= 0}
      >
        <Minus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </Button>
      <div className="h-8 w-12 sm:h-9 sm:w-16 flex items-center justify-center bg-primary/10 rounded font-bold text-base sm:text-lg">
        {value}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 w-8 sm:h-9 sm:w-9 p-0"
        onClick={increment}
        disabled={disabled}
      >
        <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </Button>
    </div>
  );
};
