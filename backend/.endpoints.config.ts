import * as dotenv from 'dotenv';

dotenv.config();

interface Config {
    supabaseURL: string;
    /** Service role JWT — bypasses RLS; use only on this server, never in browsers. */
    supabaseServiceRoleKey: string;
}

export const config: Config = {
    supabaseURL: process.env.SUPABASE_URL ?? "",
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

