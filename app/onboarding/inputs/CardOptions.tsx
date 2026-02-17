import type { OnboardingQuestionOption } from "@/constants/onboardingQuestions";
import styles from "../OnboardingFlow.module.css";

export function CardOptions<T extends string | number>({
  options,
  selectedValue,
  onSelect,
  disabled
}: {
  options: Array<OnboardingQuestionOption<T>>;
  selectedValue?: T;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={styles.stack}>
      {options.map((option) => {
        const isSelected = selectedValue === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            className={`${styles.card} ${isSelected ? styles.cardSelected : ""} ${disabled ? styles.cardDisabled : ""}`}
            onClick={() => onSelect(option.value)}
            disabled={disabled}
          >
            <div>
              <div className={`${styles.cardTitle} ${isSelected ? styles.cardTitleSelected : ""}`}>{option.label}</div>
              <div className={styles.cardDesc}>{option.desc}</div>
            </div>
            {isSelected ? <div className={styles.cardTick} /> : null}
          </button>
        );
      })}
    </div>
  );
}

