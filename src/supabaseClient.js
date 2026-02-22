import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// Replace these with your actual Supabase URL and Anon Key
export const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || 'https://kwwlulfppjqkejuskuen.supabase.co';
export const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || 'sb_publishable_M_2ePJH-G2JZNpMnDoZfRg_HZiNPmy6';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
