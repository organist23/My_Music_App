import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSyncingProfile, setIsSyncingProfile] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const initializeAuth = async () => {
            try {
                setLoading(true);
                // 1. Get initial session
                const { data: { session } } = await supabase.auth.getSession();
                const sessionUser = session?.user ?? null;
                
                if (isMounted) {
                    setUser(sessionUser);
                    if (sessionUser) {
                        setIsSyncingProfile(true);
                        // CRITICAL: Await the initial profile fetch so RootNavigator 
                        // knows the role BEFORE we set loading to false.
                        await fetchProfile(sessionUser.id);
                        setIsSyncingProfile(false);
                    }
                }
            } catch (error) {
                console.error('Auth initialization error:', error);
            } finally {
                if (isMounted) {
                    setLoading(false);
                    setIsSyncingProfile(false);
                }
            }
        };

        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted) return;
            const sessionUser = session?.user ?? null;
            
            // EMAIL VERIFICATION REDIRECT
            if (event === 'SIGNED_IN' && session?.user?.email_confirmed_at) {
                const lastSignIn = new Date(session.user.last_sign_in_at).getTime();
                const confirmedAt = new Date(session.user.email_confirmed_at).getTime();
                const now = Date.now();
                
                if (Math.abs(lastSignIn - confirmedAt) < 2000 && Math.abs(now - confirmedAt) < 10000) {
                    await supabase.auth.signOut();
                    setUser(null);
                    setProfile(null);
                    setLoading(false);
                    return;
                }
            }

            // Handle session changes
            setUser(prevUser => {
                const userChanged = prevUser?.id !== sessionUser?.id;
                if (userChanged) {
                    if (sessionUser) {
                        setIsSyncingProfile(true);
                        fetchProfile(sessionUser.id).finally(() => {
                            if (isMounted) setIsSyncingProfile(false);
                        });
                    } else {
                        setProfile(null);
                        setIsSyncingProfile(false);
                    }
                    return sessionUser;
                }
                return prevUser;
            });
            
            // Only stop loading if we aren't waiting for a profile sync
            if (!isSyncingProfile) {
                setLoading(false);
            }
        });

        return () => {
            isMounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const fetchProfile = async (userId) => {
        try {
            // Add a timeout promise
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
            );

            const fetchPromise = supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            // Race the fetch against the timeout
            const { data, error } = await Promise.race([fetchPromise, timeoutPromise]);

            if (error) throw error;
            if (data) setProfile(data);
        } catch (error) {
            console.error('Error fetching profile:', error.message);
            // On error or timeout, we still have the user object, so we don't block
        }
    };

    const register = async (email, password, fullName, recoveryPin) => {
        try {
            setLoading(true);

            // 10s Timeout Helper
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Unstable network. Please check your internet connection.')), 10000)
            );

            // Register with Supabase Auth (with Timeout)
            const registerPromise = supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                    data: {
                        full_name: fullName,
                        recovery_pin: recoveryPin,
                    }
                }
            });

            const { data, error: registerError } = await Promise.race([registerPromise, timeoutPromise]);

            if (registerError) throw registerError;

            return { data, error: null };
        } catch (error) {
            let message = error.message;
            if (message.includes('Network request failed') || message.includes('Failed to fetch') || message.includes('Load failed')) {
                message = 'Unstable network. Please check your internet connection.';
            }
            return { data: null, error: { message } };
        } finally {
            setLoading(false);
        }
    };

    const resetPassword = async (email, recoveryPin, newPassword) => {
        try {
            setLoading(true);

            // 10s Timeout Helper
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Unstable network. Please check your internet connection.')), 10000)
            );

            const invokePromise = supabase.functions.invoke('reset-password-with-code', {
                body: { email: email.trim(), recoveryPin, newPassword }
            });

            const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

            if (error) {
                let errorMessage = error.message;
                if (error.context && typeof error.context.json === 'function') {
                    const body = await error.context.json();
                    if (body && body.error) errorMessage = body.error;
                }
                throw new Error(errorMessage);
            }
            return { data, error: null };
        } catch (error) {
            let message = error.message;
            if (message.includes('Network request failed') || message.includes('Failed to fetch') || message.includes('Load failed')) {
                message = 'Unstable network. Please check your internet connection.';
            }
            return { data: null, error: { message } };
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        try {
            setLoading(true);

            // 10s Timeout Helper
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Unstable network. Please check your internet connection.')), 10000)
            );

            // Login with Supabase (with Timeout)
            const loginPromise = supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            const { data, error } = await Promise.race([loginPromise, timeoutPromise]);

            if (error) {
                let friendlyMessage = error.message;
                if (error.status === 400 || error.message.includes('Invalid login credentials')) {
                    friendlyMessage = 'Invalid email or password. Please try again.';
                } else if (error.status === 429) {
                    friendlyMessage = 'Too many attempts. Please try again later.';
                } else if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
                    friendlyMessage = 'Unstable network. Please check your internet connection.';
                }
                return { data: null, error: { ...error, message: friendlyMessage } };
            }

            return { data, error: null };
        } catch (error) {
            return { data: null, error: { message: 'Unstable network. Please check your internet connection.' } };
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        try {
            setLoading(true);
            
            // Create a timeout for the sign out call to handle unstable networks
            const signOutPromise = supabase.auth.signOut();
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Logout timeout')), 5000)
            );

            // Race the sign out against the timeout
            await Promise.race([signOutPromise, timeoutPromise]).catch(err => {
                console.log('Sign out non-critical error (timeout or network):', err.message);
                // We don't throw here because we want to clear local state regardless
            });

        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // ALWAYS clear local state and stop loading, even if the server call failed
            setUser(null);
            setProfile(null);
            setLoading(false);
        }
        return { error: null };
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            profile, 
            role: profile?.role,
            loading, 
            isSyncingProfile,
            login, 
            register, 
            resetPassword,
            logout 
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
