import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Alert } from 'react-native';

const MenuContext = createContext();

export const MenuProvider = ({ children }) => {
    const [menuVisible, setMenuVisible] = useState(false);
    const [storageUsage, setStorageUsage] = useState(0); // in bytes
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [formatProgress, setFormatProgress] = useState(null); // { current, total, name }

    const openMenu = () => setMenuVisible(true);
    const closeMenu = () => setMenuVisible(false);

    const refreshStorageUsage = async () => {
        try {
            setIsRefreshing(true);
            let totalBytes = 0;

            const buckets = ['music-files', 'cover-images'];
            for (const bucket of buckets) {
                // List more files (limit 10000) to ensure accurate calculation for large libraries
                const { data, error } = await supabase.storage.from(bucket).list('', {
                    limit: 10000,
                    offset: 0,
                    sortBy: { column: 'name', order: 'asc' },
                });
                
                if (error) throw error;
                if (data) {
                    data.forEach(file => {
                        // Skip folders (which usually don't have a size or metadata)
                        if (file.metadata) {
                            totalBytes += (file.metadata.size || 0);
                        }
                    });
                }
            }

            setStorageUsage(totalBytes);
        } catch (error) {
            console.error('Refresh storage error:', error);
        } finally {
            setIsRefreshing(false);
        }
    };

    const formatSystem = async () => {
        try {
            setFormatProgress({ current: 0, total: 100, name: 'Initializing...' });
            const errors = [];
            
            // 1. Gather all files to delete for progress calculation
            const buckets = ['music-files', 'cover-images'];
            const allFiles = [];
            
            for (const bucket of buckets) {
                try {
                    const { data, error: listErr } = await supabase.storage.from(bucket).list('', { limit: 10000 });
                    if (listErr) throw listErr;
                    if (data) {
                        data.forEach(f => allFiles.push({ bucket, name: f.name }));
                    }
                } catch (e) {
                    errors.push(`${bucket} list failed: ${e.message}`);
                }
            }

            const tables = [
                { name: 'playlist_songs', col: 'id' },
                { name: 'favorites', col: 'id' },
                { name: 'music_requests', col: 'id' },
                { name: 'playlists', col: 'id' },
                { name: 'download_permissions', col: 'user_id' },
                { name: 'music', col: 'id' }
            ];

            const totalSteps = allFiles.length + tables.length;
            let currentStep = 0;

            // 2. Delete Storage Files
            for (const file of allFiles) {
                currentStep++;
                setFormatProgress({ current: currentStep, total: totalSteps, name: `Deleting ${file.name}` });
                
                const { error: delErr } = await supabase.storage.from(file.bucket).remove([file.name]);
                if (delErr) {
                    errors.push(`${file.bucket}/${file.name}: ${delErr.message}`);
                }
            }

            // 3. Clear Database Tables
            for (const table of tables) {
                currentStep++;
                setFormatProgress({ current: currentStep, total: totalSteps, name: `Clearing ${table.name}` });
                
                const { error } = await supabase
                    .from(table.name)
                    .delete()
                    .not(table.col, 'is', null);
                
                if (error && error.code !== 'PGRST116') {
                    const msg = error.message.includes('policy') ? 'Blocked by RLS Policy' : error.message;
                    errors.push(`${table.name} database: ${msg}`);
                }
            }

            setFormatProgress(null);
            await refreshStorageUsage();

            if (errors.length > 0) {
                Alert.alert(
                    'Partial Cleanup',
                    'Some items could not be deleted. Check RLS Policies.\n\nStuck Items:\n' + errors.join('\n'),
                    [{ text: 'OK' }]
                );
                return false;
            } else {
                Alert.alert('Success', 'Total project reset complete. All music and data have been wiped.');
                return true;
            }
        } catch (error) {
            setFormatProgress(null);
            Alert.alert('Fatal Format Error', error.message);
            return false;
        }
    };

    return (
        <MenuContext.Provider value={{ 
            menuVisible, 
            openMenu, 
            closeMenu, 
            storageUsage, 
            isRefreshing, 
            refreshStorageUsage, 
            formatSystem,
            formatProgress 
        }}>
            {children}
        </MenuContext.Provider>
    );
};

export const useMenu = () => useContext(MenuContext);
