import type { OnboardingQuestionOption } from "@/constants/onboardingQuestions";
import styles from "../OnboardingFlow.module.css";
import { CardOptions } from "./CardOptions";

export function RankSelector<T extends string>({
  options,
  selected,
  maxSelect = 2,
  instruction,
  onChange
}: {
  options: Array<OnboardingQuestionOption<T>>;
  selected: T[];
  maxSelect?: number;
  instruction?: string;
  onChange: (next: T[]) => void;
}) {
  const isMaxed = selected.length >= maxSelect;

  function toggle(value: T) {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
      return;
    }
    if (!isMaxed) {
      onChange([...selected, value]);
    }
  }

  return (
    <div>
      <div className={styles.rankHeader}>
        <span className={`${styles.rankCounter} ${isMaxed ? styles.rankCounterMaxed : ""}`}>
          {selected.length}/{maxSelect} selected
        </span>
        {instruction}
      </div>

      <div className={styles.stack}>
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <CardOptions
              key={String(option.value)}
              options={[option]}
              selectedValue={isSelected ? option.value : undefined}
              onSelect={() => toggle(option.value)}
              disabled={!isSelected && isMaxed}
            />
          );
        })}
      </div>
    </div>
  );
}

