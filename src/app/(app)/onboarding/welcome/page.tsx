import { Logo } from '@/components/brand/logo';
import { GetStartedButton } from './get-started';

/**
 * Post-sign-in welcome screen (FND-12 funnel step 2, Plan 01-07).
 *
 * Per the UI-SPEC: Mark + H2 "Welcome to Trochia" + sub "Let's set up your
 * operator. Two quick steps." + Primary "Get started".
 *
 * "Get started" records DPA + ToS + Privacy acceptance (the clickwrap line on
 * `/sign-up` flags this contract; the durable record is written here, the
 * first time the founder has an `accounts` row to attach it to) and routes to
 * `/onboarding` which renders the tier picker.
 */
export default function WelcomePage() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-8 px-6 py-16 md:py-24">
      <Logo variant="mark" height={48} href={null} />
      <header className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-h2 text-ink">Welcome to Trochia</h1>
        <p className="text-body text-graphite">
          Let&apos;s set up your operator. Two quick steps.
        </p>
      </header>
      <GetStartedButton />
      <p className="text-center text-body-sm text-graphite">
        By continuing you confirm acceptance of our Terms, Privacy, and Data Processing Addendum.
      </p>
    </main>
  );
}
