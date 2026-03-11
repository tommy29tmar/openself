import { getConfiguredProviders } from "@/lib/auth/providers";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const providers = getConfiguredProviders();
  const { error } = await searchParams;
  return <LoginForm providers={providers} oauthError={error ?? null} />;
}
