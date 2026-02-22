import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase, supabaseUrl, supabaseAnonKey } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useMenu } from '../../context/MenuContext';

/**
 * UploadMusicScreen - Version 5
 * Re-engineered using expo-file-system native UploadTask.
 * This handles large WAV/MP3 files much better than XMLHttpRequest 
 * by avoiding JS heap memory issues.
 */
const UploadMusicScreen = ({ navigation }) => {
    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [genre, setGenre] = useState('');
    const [audioFile, setAudioFile] = useState(null);
    const [coverImage, setCoverImage] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0); // 0 to 100
    const [uploadStatus, setUploadStatus] = useState(''); // Status message
    const uploadTaskRef = useRef(null);
    const { user } = useAuth();
    const { refreshStorageUsage } = useMenu();

    const pickAudio = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'audio/*',
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setAudioFile(result.assets[0]);
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to pick audio file');
        }
    };

    const pickImage = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setCoverImage(result.assets[0]);
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to pick cover image');
        }
    };

const uploadFile = async (file, bucket, progressWeight, progressOffset, attempt = 1) => {
        const fileExt = file.name ? file.name.split('.').pop().toLowerCase() : (bucket === 'cover-images' ? 'jpg' : 'mp3');
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        console.log(`[Upload] Attempt ${attempt}: ${bucket}/${fileName}`);
        
        // Dynamic check for UploadType to prevent "undefined" errors
        const binaryUploadType = FileSystem.FileSystemUploadType?.BINARY_CONTENT ?? 0;

        let token;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            token = session?.access_token;
        } catch (sessionErr) {
            console.error('[Upload] Session error:', sessionErr);
            throw new Error('Could not verify your login session. Please log out and log in again.');
        }

        if (!token) {
            throw new Error('Your session has expired. Please log out and log in again.');
        }

        const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`;
        
        // Determine MimeType properly
        let contentType = file.mimeType;
        if (!contentType) {
            if (fileExt === 'wav') contentType = 'audio/wav';
            else if (fileExt === 'mp3') contentType = 'audio/mpeg';
            else if (bucket === 'cover-images') contentType = 'image/jpeg';
            else contentType = 'application/octet-stream';
        }

        try {
            const uploadTask = FileSystem.createUploadTask(
                uploadUrl,
                file.uri,
                {
                    httpMethod: 'POST',
                    uploadType: binaryUploadType,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'apikey': supabaseAnonKey,
                        'Content-Type': contentType,
                    },
                },
                (data) => {
                    const { totalBytesSent, totalBytesExpectedToSend } = data;
                    const percentComplete = (totalBytesSent / totalBytesExpectedToSend) * 100;
                    const overallProgress = progressOffset + (percentComplete * (progressWeight / 100));
                    const clampedProgress = Math.min(progressOffset + progressWeight, Math.max(progressOffset, Math.floor(overallProgress)));
                    setUploadProgress(clampedProgress);
                }
            );

            uploadTaskRef.current = uploadTask;
            const result = await uploadTask.uploadAsync();
            uploadTaskRef.current = null;

            if (result.status >= 200 && result.status < 300) {
                setUploadProgress(progressOffset + progressWeight);
                console.log(`[Upload] Success: ${bucket}/${fileName}`);
                const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);
                return publicUrl;
            } else {
                let errorMsg = 'Storage error';
                try {
                    const res = JSON.parse(result.body);
                    errorMsg = res.message || res.error || errorMsg;
                } catch (e) {
                    errorMsg = `Server responded with status ${result.status}`;
                }
                console.error(`[Upload] Failure (${result.status}):`, errorMsg);
                throw new Error(errorMsg);
            }
        } catch (error) {
            uploadTaskRef.current = null;
            if (error.message?.includes('cancelled')) throw new Error('Upload cancelled');

            console.error(`[Upload] Error during task (Attempt ${attempt}):`, error.message);
            
            if (attempt < 3) {
                const retryDelay = 2000 * attempt;
                setUploadStatus(`Connection unstable, retrying (${attempt}/3)...`);
                await new Promise(r => setTimeout(r, retryDelay));
                return uploadFile(file, bucket, progressWeight, progressOffset, attempt + 1);
            } else {
                throw new Error('NETWORK_ERROR');
            }
        }
    };

    const handleCancel = () => {
        if (uploadTaskRef.current) {
            uploadTaskRef.current.cancelAsync();
            setUploading(false);
            setUploadProgress(0);
            setUploadStatus('');
            Alert.alert('Cancelled', 'Upload has been cancelled.');
        }
    };

    const handleUpload = async () => {
        if (!title || !artist || !genre || !audioFile || !coverImage) {
            Alert.alert('Error', 'Please fill in all fields and select files');
            return;
        }

        try {
            setUploading(true);
            setUploadProgress(1);
            setUploadStatus('Preparing files...');

            // 1. Upload audio (70%)
            setUploadStatus('Uploading Audio...');
            const audioUrl = await uploadFile(audioFile, 'music-files', 70, 0);

            // 2. Upload cover (25%)
            setUploadStatus('Uploading Cover...');
            const coverUrl = await uploadFile(coverImage, 'cover-images', 25, 70);

            // 3. Save to database (5%)
            setUploadStatus('Finalizing...');
            setUploadProgress(95);

            const { error } = await supabase.from('music').insert([
                {
                    title,
                    artist,
                    genre,
                    audio_url: audioUrl,
                    cover_url: coverUrl,
                    uploaded_by: user.id
                }
            ]);

            if (error) throw error;

            console.log('[Upload] Database entry created!');
            setUploadProgress(100);
            setUploadStatus('Complete!');
            
            // Refresh storage totals in background
            refreshStorageUsage().catch(e => console.error('Silent storage refresh error:', e));
            
            Alert.alert('Success', 'Music uploaded successfully!', [
                { text: 'OK', onPress: () => navigation.goBack() }
            ]);
        } catch (error) {
            if (error.message === 'Upload cancelled') return;

            console.error('Final Upload Error:', error.message);

            // Classify the error into a user-friendly message
            let title = 'Upload Failed';
            let message = 'An unexpected error occurred. Please try again.';

            if (error.message === 'NETWORK_ERROR') {
                title = 'Upload Interrupted';
                message = 'The upload was interrupted. This could be due to a flaky internet connection, a very large file, or a temporary server issue. Please try again with a smaller file or on a more stable network.';
            } else if (error.message === 'TIMEOUT_ERROR') {
                title = 'Upload Timed Out';
                message = 'The connection was too slow and the upload timed out after several attempts. Try a faster network or a smaller file.';
            } else if (error.message.includes('session') || error.message.includes('log in')) {
                title = 'Session Expired';
                message = error.message;
            } else if (error.message.includes('security policy') || error.message.includes('row-level')) {
                title = 'Permission Denied';
                message = 'Your account does not have permission to upload music. Make sure you are logged in as an admin.';
            } else if (error.message.includes('500') || error.message.includes('server')) {
                title = 'Server Error';
                message = 'The server encountered an error. Please wait a moment and try again. If the problem persists, try a different file.';
            } else if (error.message.includes('read') || error.message.includes('file')) {
                title = 'File Error';
                message = error.message;
            } else {
                message = error.message || message;
            }

            Alert.alert(title, message, [{ text: 'OK' }]);
        } finally {
            setUploading(false);
            setUploadProgress(0);
            setUploadStatus('');
            uploadTaskRef.current = null;
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            
            <View style={styles.inputContainer}>
                <Text style={styles.label}>Track Title</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. Moonlight Sonata"
                    placeholderTextColor="#666"
                    value={title}
                    onChangeText={setTitle}
                    editable={!uploading}
                />

                <Text style={styles.label}>Artist</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. Beethoven"
                    placeholderTextColor="#666"
                    value={artist}
                    onChangeText={setArtist}
                    editable={!uploading}
                />

                <Text style={styles.label}>Genre</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. Classical"
                    placeholderTextColor="#666"
                    value={genre}
                    onChangeText={setGenre}
                    editable={!uploading}
                />

                <Text style={styles.label}>Audio File</Text>
                <TouchableOpacity 
                    style={[styles.filePicker, uploading && styles.pickerDisabled]} 
                    onPress={pickAudio} 
                    disabled={uploading}
                >
                    <Text style={styles.filePickerText} numberOfLines={1}>
                        {audioFile ? audioFile.name : 'Select Audio File'}
                    </Text>
                </TouchableOpacity>

                <Text style={styles.label}>Cover Image</Text>
                <TouchableOpacity 
                    style={[styles.filePicker, uploading && styles.pickerDisabled]} 
                    onPress={pickImage} 
                    disabled={uploading}
                >
                    {coverImage ? (
                        <Image source={{ uri: coverImage.uri }} style={styles.previewImage} />
                    ) : (
                        <Text style={styles.filePickerText}>Select Cover Image</Text>
                    )}
                </TouchableOpacity>
            </View>

            <TouchableOpacity 
                style={[styles.button, uploading && styles.buttonDisabled]} 
                onPress={handleUpload}
                disabled={uploading}
            >
                {uploading ? (
                    <View style={styles.progressWrapper}>
                        <View style={styles.progressBarContainer}>
                            <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
                        </View>
                        <View style={styles.progressTextContainer}>
                            <Text style={styles.progressPercText}>{uploadProgress}%</Text>
                            <Text style={styles.progressStatusText}>{uploadStatus}</Text>
                        </View>
                    </View>
                ) : (
                    <Text style={styles.buttonText}>Publish Track</Text>
                )}
            </TouchableOpacity>

            {uploading && (
                <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                    <Ionicons name="close-circle-outline" size={20} color="#ff4444" style={styles.cancelIcon} />
                    <Text style={styles.cancelButtonText}>Cancel Upload</Text>
                </TouchableOpacity>
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flexGrow: 1,
        backgroundColor: '#121212',
        padding: 20,
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        color: '#fff',
        fontSize: 14,
        marginBottom: 8,
        fontWeight: 'bold',
        opacity: 0.8,
    },
    input: {
        backgroundColor: '#1E1E1E',
        color: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#333',
    },
    filePicker: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#333',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
    },
    pickerDisabled: {
        opacity: 0.5,
    },
    filePickerText: {
        color: '#aaa',
        fontSize: 14,
    },
    previewImage: {
        width: 100,
        height: 100,
        borderRadius: 12,
    },
    button: {
        backgroundColor: '#1DB954',
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 20,
        minHeight: 60,
        justifyContent: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#282828',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    progressWrapper: {
        width: '100%',
        paddingHorizontal: 20,
        alignItems: 'center',
    },
    progressBarContainer: {
        width: '100%',
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#1DB954',
    },
    progressTextContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
    },
    progressPercText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    progressStatusText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
    },
    cancelButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
        paddingVertical: 12,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: 'rgba(255, 68, 68, 0.2)',
        marginTop: 10,
        marginBottom: 40,
    },
    cancelIcon: {
        marginRight: 8,
    },
    cancelButtonText: {
        color: '#ff4444',
        fontSize: 14,
        fontWeight: 'bold',
    },
});

export default UploadMusicScreen;
