import { cookies } from 'next/headers';
import { supabaseAdmin } from './supabase';

/**
 * Verify the current user is authenticated AND is a verified lawyer.
 *
 * Reads the `sb-access-token` cookie (set by Supabase Auth on login),
 * validates it with Supabase, then checks the lawyer_profiles table.
 *
 * Returns the lawyer profile if valid, or null if not authenticated / not a lawyer.
 */
export async function getVerifiedLawyer(): Promise<{
  userId: string;
  fullName: string;
  barNumber: string;
  specialties: string[];
} | null> {
  try {
    const cookieStore = await cookies();
    const accessToken =
      cookieStore.get('sb-access-token')?.value ||
      cookieStore.get('sb-rrkspwzhrvxkrocujfpo-auth-token')?.value;

    if (!accessToken) return null;

    // Validate the JWT with Supabase Auth
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);

    if (authError || !user) return null;

    // Check if this user has a verified lawyer profile
    const { data: lawyer, error: lawyerError } = await supabaseAdmin
      .from('lawyer_profiles')
      .select('full_name, bar_number, specialties, verified')
      .eq('user_id', user.id)
      .single();

    if (lawyerError || !lawyer || !lawyer.verified) return null;

    return {
      userId: user.id,
      fullName: lawyer.full_name,
      barNumber: lawyer.bar_number,
      specialties: lawyer.specialties || [],
    };
  } catch {
    return null;
  }
}
