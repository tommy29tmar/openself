import { getConfiguredProviders } from "@/lib/auth/providers";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  const providers = getConfiguredProviders();
  return <SignupForm providers={providers} />;
}
