import { Mail, ArrowRight } from "lucide-react";
export default function MailConfirmation({ mode }: { mode: "register" | "forgot" | "resend" }) {
  return <div className="mail-confirmation" role="status" aria-live="polite">
    <div className="mail-confirmation-icon"><Mail size={30} strokeWidth={1.4} /></div>
    <div className="eyebrow">{mode === "register" ? "REGISTRATION RECEIVED" : "EMAIL REQUEST RECEIVED"}</div>
    <h1 id="mail-confirmation-heading" tabIndex={-1}>Check your inbox.</h1>
    <p>{mode === "register" ? "Your registration request is complete. Check your inbox for the verification email and follow the link to activate your account." : mode === "forgot" ? "Check your inbox for a password reset link. Follow the instructions in the email to choose a new password." : "Check your inbox for a verification email. Follow the link to verify your email address."}</p>
    <p className="mail-help">Can’t find it? Check your spam or junk folder and allow a few minutes for delivery.</p>
    <a className="primary" href="/account">Back to sign in <ArrowRight size={17} /></a>
    <a className="confirmation-resend" href={mode === "forgot" ? "/account?mode=forgot" : "/account?mode=resend"}>Request another email</a>
  </div>;
}
