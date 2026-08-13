# Scanner-safe account setup emails

## Diagnosis
Both recipients' invite and recovery requests completed successfully, entered the live email queue, and were accepted by the mail provider. Neither address is suppressed. The auth logs then show the one-time verification URLs being opened from enterprise security-network addresses, consistent with Microsoft Safe Links or another mail scanner consuming the links before the recipient opens them.

## Changes
- Change password-recovery emails to lead with a one-time code rather than a one-click auth link, so automated URL scanners cannot consume the user's credential.
- Add a code-entry step to the login recovery flow; verify the code through backend auth, then open the existing password creation screen.
- Keep generic success responses and existing provisioning checks to avoid user enumeration.
- Update the invite email to direct users to the scanner-safe setup flow instead of embedding a consumable auth URL.
- Brand the affected templates as Intrinsic and update the email-system documentation with diagnosis and operations guidance.

## Verification
- Run the relevant frontend tests and JSX parse check.
- Deploy the updated auth email function.
- Trigger fresh recovery emails for Orlena and Michelle and verify the queue records them as sent.
- Confirm no suppression or delivery error is recorded.

## Technical details
Recovery codes use the auth event's existing OTP token and are verified client-side with the backend's recovery OTP method. The password itself is still set only after an authenticated recovery session is established.
