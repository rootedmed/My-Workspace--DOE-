import type { OnboardingQuestionOption } from "@/constants/onboardingQuestions";
import styles from "../OnboardingFlow.module.css";

export function SpectrumSelector({
  options,
  leftLabel,
  rightLabel,
  value,
  onChange,
  activeColor
}: {
  options: Array<OnboardingQuestionOption<number>>;
  leftLabel?: string;
  rightLabel?: string;
  value?: number;
  onChange: (value: number) => void;
  activeColor: string;
}) {
  return (
    <div>
      <div className={styles.spectrumLabels}>
        <span className={styles.spectrumLabelLeft}>{leftLabel}</span>
        <span className={styles.spectrumLabelRight}>{rightLabel}</span>
      </div>
      <div className={styles.spectrumButtons}>
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              className={`${styles.spectrumBtn} ${selected ? styles.spectrumBtnSelected : ""}`}
              onClick={() => onChange(option.value)}
            >
              <div className={styles.spectrumDot} style={{ background: selected ? activeColor : undefined }}>
                {option.value}
              </div>
            </button>
          );
        })}
      </div>
      {value ? (
        <div className={styles.spectrumDescWrap}>
          <div className={styles.spectrumDesc}>{options.find((option) => option.value === value)?.desc}</div>
        </div>
      ) : null}
    </div>
  );
}

