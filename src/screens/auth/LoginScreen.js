import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image, Dimensions, KeyboardAvoidingView, Platform, ImageBackground, ScrollView } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const LoginScreen = ({ navigation }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const { login, loading } = useAuth();

    const handleLogin = async () => {
        if (!email || !password) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }
        const { error } = await login(email.trim(), password);
        if (error) {
            const isNetworkError = error.message.includes('network') || error.message.includes('internet connection');
            Alert.alert(
                isNetworkError ? 'No Internet' : 'Login Failed', 
                error.message
            );
        }
    };

    return (
        <View style={styles.mainContainer}>
            <View style={styles.circularBackgroundContainer}>
                <Image 
                    source={require('../../../logo/login.png')} 
                    style={styles.circularBackgroundImage}
                    resizeMode="cover"
                />
            </View>
            <KeyboardAvoidingView 
                behavior="padding"
                style={styles.container}
            >
                <View style={styles.userInteractionsContainer}>
                    <ScrollView 
                        contentContainerStyle={styles.scrollContainer} 
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={styles.logoContainer}>
                            <Image 
                                source={require('../../../logo/logo_login.png')} 
                                style={styles.logo}
                                resizeMode="cover"
                            />
                        </View>

                        <View style={styles.contentContainer}>
                            <View style={styles.card}>
                                <Text style={styles.subtitle}>Sign in to your account</Text>
                                <View style={styles.inputSection}>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Email Address"
                                            placeholderTextColor="#666"
                                            value={email}
                                            onChangeText={setEmail}
                                            autoCapitalize="none"
                                            keyboardType="email-address"
                                        />
                                    </View>

                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Password"
                                            placeholderTextColor="#666"
                                            value={password}
                                            onChangeText={setPassword}
                                            secureTextEntry={!showPassword}
                                        />
                                        <TouchableOpacity 
                                            onPress={() => setShowPassword(!showPassword)}
                                            style={styles.eyeIcon}
                                        >
                                            <Ionicons 
                                                name={showPassword ? "eye-off-outline" : "eye-outline"} 
                                                size={22} 
                                                color="#666" 
                                            />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <TouchableOpacity 
                                    style={[styles.button, (!email || !password) && styles.buttonDisabled]} 
                                    onPress={handleLogin}
                                    disabled={loading || !email || !password}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#000" />
                                    ) : (
                                        <Text style={styles.buttonText}>Login</Text>
                                    )}
                                </TouchableOpacity>
                            </View>

                            <View style={styles.footer}>
                                <Text style={styles.footerText}>Don't have an account? </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                                    <Text style={styles.linkHighlight}>Register Now</Text>
                                </TouchableOpacity>
                            </View>

                            <TouchableOpacity 
                                style={{ marginTop: 15 }} 
                                onPress={() => navigation.navigate('ResetPassword')}
                            >
                                <Text style={styles.linkHighlight}>Forgot Password?</Text>
                            </TouchableOpacity>

                            <Text style={styles.copyrightText}>© 2026 Keiphil Guimba</Text>
                            <Text style={styles.versionText}>v4.1.4</Text>
                        </View>
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
};

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: '#000000',
    },
    container: {
        flex: 1,
    },
    circularBackgroundContainer: {
        position: 'absolute',
        top: '15%',
        alignSelf: 'center',
        width: width * 1.2,
        height: width * 1.2,
        borderRadius: (width * 1.2) / 2,
        overflow: 'hidden',
        opacity: 0.6,
        borderWidth: 2,
        borderColor: 'rgba(29, 185, 84, 0.2)',
    },
    circularBackgroundImage: {
        width: '100%',
        height: '100%',
    },
    userInteractionsContainer: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)', // Overall dark overlay to fade the circle edges
    },
    scrollContainer: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: 25,
        paddingVertical: 50,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 30,
    },
    logo: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: 'rgba(29, 185, 84, 0.5)',
        // Softer, more professional depth
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 10,
    },
    contentContainer: {
        width: '100%',
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        letterSpacing: -0.5,
        textAlign: 'center',
    },
    subtitle: {
        fontSize: 15,
        color: '#aaa',
        marginTop: 0,
        fontWeight: '500',
        marginBottom: 25,
        textAlign: 'center',
    },
    card: {
        width: '100%',
        backgroundColor: 'rgba(30, 30, 30, 0.85)', // Glassmorphism
        borderRadius: 30,
        padding: 28,
        paddingTop: 20,
        borderWidth: 1.5,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        elevation: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.58,
        shadowRadius: 16.00,
    },
    inputSection: {
        width: '100%',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#282828',
        borderRadius: 15,
        marginBottom: 16,
        paddingHorizontal: 15,
        borderWidth: 1,
        borderColor: '#333',
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        color: '#fff',
        paddingVertical: 14,
        fontSize: 16,
    },
    eyeIcon: {
        padding: 4,
    },
    button: {
        backgroundColor: '#1DB954',
        paddingVertical: 16,
        borderRadius: 15,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        marginTop: 10,
    },
    buttonDisabled: {
        backgroundColor: '#147a38',
        opacity: 0.7,
    },
    buttonText: {
        color: '#000',
        fontSize: 18,
        fontWeight: 'bold',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 30,
    },
    footerText: {
        color: '#aaa',
        fontSize: 15,
    },
    linkHighlight: {
        color: '#1DB954',
        fontSize: 15,
        fontWeight: 'bold',
    },
    copyrightText: {
        color: '#666',
        fontSize: 12,
        marginTop: 30,
        textAlign: 'center',
    },
    versionText: {
        color: '#444',
        fontSize: 10,
        marginTop: 6,
        textAlign: 'center',
        fontWeight: 'bold',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
});

export default LoginScreen;
