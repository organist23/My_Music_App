import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useMenu } from '../../context/MenuContext';

/**
 * UploadMusicScreen - Version 3
 * Re-implemented to handle music uploads with progress tracking, 
 * cancellation, and advanced error handling for RLS and 500 errors.
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
    const activeXhr = useRef(null);
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

    const uploadFile = async (file, bucket, progressWeight, progressOffset) => {
        const fileExt = file.name ? file.name.split('.').pop() : (bucket === 'cover-images' ? 'jpg' : 'mp3');
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        console.log(`[Upload] Starting: ${bucket}/${fileName}`);
        
        // Get file blob for reliable binary upload
        // We use fetch(uri) + blob() which is the most reliable way to get binary data in React Native/Expo
        const response = await fetch(file.uri);
        const blob = await response.blob();

        // Get actual session token for RLS to work properly
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        if (!token) {
            throw new Error('Authentication required. Please log in again.');
        }

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            activeXhr.current = xhr;
            
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    const overallProgress = progressOffset + (percentComplete * (progressWeight / 100));
                    const clampedProgress = Math.min(progressOffset + progressWeight, Math.max(progressOffset, Math.floor(overallProgress)));
                    setUploadProgress(clampedProgress);
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    setUploadProgress(progressOffset + progressWeight);
                    console.log(`[Upload] Success: ${bucket}/${fileName}`);
                    
                    const { data: { publicUrl } } = supabase.storage
                        .from(bucket)
                        .getPublicUrl(filePath);
                    resolve(publicUrl);
                } else {
                    let errorMsg = 'Storage error';
                    try {
                        const res = JSON.parse(xhr.responseText);
                        errorMsg = res.message || res.error || errorMsg;
                    } catch (e) {
                        errorMsg = `Status ${xhr.status}`;
                    }
                    console.error(`[Upload] Failure (${xhr.status}):`, errorMsg);
                    reject(new Error(errorMsg));
                }
            });

            xhr.addEventListener('error', (e) => {
                console.error('[Upload] Network Error:', e);
                reject(new Error('Network error during upload'));
            });
            
            xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

            // Direct API call to avoid potential client library wrapper issues causing 500s
            xhr.open('POST', `${supabase.supabaseUrl}/storage/v1/object/${bucket}/${filePath}`);
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            xhr.setRequestHeader('apikey', supabase.supabaseKey);
            xhr.setRequestHeader('Content-Type', file.mimeType || (bucket === 'cover-images' ? 'image/jpeg' : 'audio/mpeg'));
            
            xhr.send(blob);
        });
    };

    const handleCancel = () => {
        if (activeXhr.current) {
            activeXhr.current.abort();
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
            if (error.message !== 'Upload cancelled') {
                console.error('Final Upload Error:', error);
                
                // If it's a 500 error, it's usually transient or a binary issue
                const advice = error.message.includes('500') 
                    ? '\n\nThis is a server error. Try a different file or check your connection.' 
                    : '';
                
                Alert.alert('Upload Error', (error.message || 'An error occurred during upload') + advice);
            }
        } finally {
            setUploading(false);
            activeXhr.current = null;
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.header}>Upload New Track</Text>
            
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
    header: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 24,
        textAlign: 'center',
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
