import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Done Admin</h1>
      <p className="mb-6 text-sm text-neutral-500">Sign in with an admin account.</p>
      <AuthForm mode="sign-in" action={signIn} />
    </div>
  );
}
