import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useMenu } from '../../context/MenuContext';

const UploadMusicScreen = ({ navigation }) => {
    const [title, setTitle] = useState('');
    const [artist, setArtist] = useState('');
    const [genre, setGenre] = useState('');
    const [audioFile, setAudioFile] = useState(null);
    const [coverImage, setCoverImage] = useState(null);
    const [uploading, setUploading] = useState(false);
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

    const uploadFile = async (file, bucket) => {
        const fileExt = file.name ? file.name.split('.').pop() : 'jpg';
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const formData = new FormData();
        formData.append('file', {
            uri: file.uri,
            name: fileName,
            type: file.mimeType || 'image/jpeg',
        });

        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(filePath, formData);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

        return publicUrl;
    };

    const handleUpload = async () => {
        if (!title || !artist || !genre || !audioFile || !coverImage) {
            Alert.alert('Error', 'Please fill in all fields and select files');
            return;
        }

        try {
            setUploading(true);

            // 1. Upload audio
            const audioUrl = await uploadFile(audioFile, 'music-files');

            // 2. Upload cover
            const coverUrl = await uploadFile(coverImage, 'cover-images');

            // 3. Save to database
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

            await refreshStorageUsage();
            Alert.alert('Success', 'Music uploaded successfully!');
            navigation.goBack();
        } catch (error) {
            console.error('Upload Error:', error);
            Alert.alert('Upload Error', error.message || 'An error occurred during upload');
        } finally {
            setUploading(false);
        }
    };

    return (
        <ScrollView contentContainerStyle={styles.container}>
            <Text style={styles.header}>Upload New Track</Text>
            
            <Text style={styles.label}>Track Title</Text>
            <TextInput
                style={styles.input}
                placeholder="e.g. Moonlight Sonata"
                placeholderTextColor="#666"
                value={title}
                onChangeText={setTitle}
            />

            <Text style={styles.label}>Artist</Text>
            <TextInput
                style={styles.input}
                placeholder="e.g. Beethoven"
                placeholderTextColor="#666"
                value={artist}
                onChangeText={setArtist}
            />

            <Text style={styles.label}>Genre</Text>
            <TextInput
                style={styles.input}
                placeholder="e.g. Classical"
                placeholderTextColor="#666"
                value={genre}
                onChangeText={setGenre}
            />

            <Text style={styles.label}>Audio File</Text>
            <TouchableOpacity style={styles.filePicker} onPress={pickAudio}>
                <Text style={styles.filePickerText}>
                    {audioFile ? audioFile.name : 'Select Audio File'}
                </Text>
            </TouchableOpacity>

            <Text style={styles.label}>Cover Image</Text>
            <TouchableOpacity style={styles.filePicker} onPress={pickImage}>
                {coverImage ? (
                    <Image source={{ uri: coverImage.uri }} style={styles.previewImage} />
                ) : (
                    <Text style={styles.filePickerText}>Select Cover Image</Text>
                )}
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.button, uploading && styles.buttonDisabled]} 
                onPress={handleUpload}
                disabled={uploading}
            >
                {uploading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.loadingText}>Uploading...</Text>
                    </View>
                ) : (
                    <Text style={styles.buttonText}>Publish Track</Text>
                )}
            </TouchableOpacity>
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
    label: {
        color: '#fff',
        fontSize: 16,
        marginBottom: 8,
        fontWeight: 'bold',
    },
    input: {
        backgroundColor: '#1E1E1E',
        color: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        marginBottom: 20,
    },
    filePicker: {
        backgroundColor: '#1E1E1E',
        borderRadius: 8,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#333',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
    },
    filePickerText: {
        color: '#aaa',
        fontSize: 14,
    },
    previewImage: {
        width: 100,
        height: 100,
        borderRadius: 8,
    },
    button: {
        backgroundColor: '#1DB954',
        paddingVertical: 16,
        borderRadius: 30,
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 40,
    },
    buttonDisabled: {
        backgroundColor: '#168a3e',
    },
    buttonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        marginLeft: 10,
        fontWeight: 'bold',
    },
});

export default UploadMusicScreen;
