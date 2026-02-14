# Privacy Policy (MVP Stub)

## Product Position
This product is a relationship decision support tool for adults seeking serious long-term partnership. It is not a medical or therapy service.

## Data We Collect
- Account data: email, password hash, first name.
- Profile data: intent/timeline/lifestyle and derived compatibility-related scores.
- Decision track progress events (state/day/reflection count).
- Optional calibration feedback (`feltRight` score).

## Data We Minimize
- Raw questionnaire responses are not retained as free-text clinical records.
- We store derived numerical signals where possible.
- If raw answers are retained for audit/debug, they should be encrypted and time-limited.

## How Data Is Used
- To compute compatibility previews.
- To personalize onboarding and decision-track flow.
- To improve user-specific match weighting via explicit calibration.

## Data Retention
- Account and profile data are retained while account is active.
- Users may request deletion; deleted users should be removed from Supabase tables.
- Calibration and track metadata are retained only as long as account exists.

## User Transparency
- Compatibility includes clear reasons and friction points.
- No diagnosis labels are shown.
- No medical claims are made.
