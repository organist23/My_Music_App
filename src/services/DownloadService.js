import * as FileSystem from 'expo-file-system/legacy';
const { StorageAccessFramework } = FileSystem;
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

let activeDownloadResumable = null;

export const cancelActiveDownload = async () => {
    if (activeDownloadResumable) {
        try {
            await activeDownloadResumable.cancelAsync();
            activeDownloadResumable = null;
            return true;
        } catch (error) {
            console.error('Error cancelling download:', error);
        }
    }
    return false;
};

export const downloadMusicFile = async (url, fileName, trackId, onProgress, silent = false) => {
    if (!url || !fileName || !trackId) {
        console.error('Invalid download parameters:', { url, fileName, trackId });
        Alert.alert('Download Error', 'Required download information is missing.');
        return { success: false, error: 'Invalid parameters' };
    }

    try {
        // 1. Create a safe, unique filename using trackId
        const safeTitle = fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const safeFileName = `${trackId}_${safeTitle}.mp3`;
        const fileUri = FileSystem.documentDirectory + safeFileName;

        // 2. Check if file already exists
        const fileInfo = await FileSystem.getInfoAsync(fileUri);
        if (fileInfo.exists && !silent) {
            const shouldOverwrite = await new Promise((resolve) => {
                Alert.alert(
                    'File Exists',
                    'This track is already downloaded. Do you want to download it again?',
                    [
                        { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
                        { text: 'Download Again', onPress: () => resolve(true) }
                    ]
                );
            });
            if (!shouldOverwrite) {
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri);
                }
                return { success: true, alreadyExists: true };
            }
        }

        // 3. Start download
        activeDownloadResumable = FileSystem.createDownloadResumable(
            url,
            fileUri,
            {},
            (downloadProgress) => {
                const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                if (onProgress) onProgress(progress);
            }
        );

        const downloadResult = await activeDownloadResumable.downloadAsync();
        activeDownloadResumable = null;

        if (!downloadResult) {
            return { success: false, cancelled: true };
        }

        const { uri } = downloadResult;
        
        // 4. Save/Share the file (only if not silent)
        if (!silent) {
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri);
            } else {
                Alert.alert('Download Complete', 'File saved to: ' + uri);
            }
        }

        return { success: true, uri };
    } catch (error) {
        activeDownloadResumable = null;
        
        // Catch cancellation specifically so we don't show an error alert
        if (error.message && error.message.includes('Download cancelled')) {
            return { success: false, cancelled: true };
        }
        
        console.error('Download error:', error);
        if (!silent) {
            Alert.alert('Download Error', 'Failed to download the music file. Please try again.');
        }
        return { success: false, error };
    }
};

/**
 * Android Only: Saven a file to a SAF directory URI
 */
export const saveToSAF = async (fileUri, fileName, directoryUri) => {
    try {
        if (Platform.OS !== 'android') return { success: false };
        
        const content = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        
        const newFileUri = await StorageAccessFramework.createFileAsync(
            directoryUri,
            fileName,
            'audio/mpeg'
        );
        
        await FileSystem.writeAsStringAsync(newFileUri, content, {
            encoding: FileSystem.EncodingType.Base64,
        });
        
        return { success: true, uri: newFileUri };
    } catch (error) {
        console.error('SAF Save Error:', error);
        return { success: false, error };
    }
};
