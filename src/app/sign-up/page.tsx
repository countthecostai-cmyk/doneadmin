import Link from "next/link";
import { signIn } from "@/app/auth/actions";
import { AuthForm } from "@/components/AuthForm";

export const dynamic = "force-dynamic";

/**
 * Done Admin is an internal console — there's no public self-serve signup
 * flow here. This route exists only so a first admin account can be created
 * directly (then promoted to is_admin via the database), and links back to
 * sign-in rather than presenting itself as a general "join Done" page.
 */
export default function SignUpRedirectPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-6 text-center">
      <h1 className="mb-1 text-2xl font-semibold text-neutral-900">Done Admin</h1>
      <p className="mb-6 text-sm text-neutral-500">
        This console is for Done staff only. If you need an admin account, ask an existing admin to create
        one and grant access.
      </p>
      <Link href="/sign-in" className="font-medium text-neutral-900 underline">
        Back to sign in
      </Link>
    </div>
  );
}
