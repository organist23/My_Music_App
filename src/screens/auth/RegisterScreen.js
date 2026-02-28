import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, Image, KeyboardAvoidingView, Platform, ImageBackground, Dimensions } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const RegisterScreen = ({ navigation }) => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [recoveryPin, setRecoveryPin] = useState('');
    const { register, loading } = useAuth();

    const handleRegister = async () => {
        if (!fullName || !email || !password || !confirmPassword || !recoveryPin) {
            Alert.alert('Error', 'Please fill in all fields including the 4-digit PIN');
            return;
        }
        if (recoveryPin.length !== 4 || !/^\d+$/.test(recoveryPin)) {
            Alert.alert('Error', 'Recovery PIN must be exactly 4 digits');
            return;
        }
        if (password !== confirmPassword) {
            Alert.alert('Error', 'Passwords do not match');
            return;
        }

        const { error } = await register(email, password, fullName, recoveryPin);
        if (error) {
            const isNetworkError = error.message.includes('Unstable network') || error.message.includes('check your internet');
            Alert.alert(
                isNetworkError ? 'No Internet' : 'Signup Failed', 
                error.message
            );
        } else {
            Alert.alert(
                'Success', 
                `Account created securely! \n\nIMPORTANT: Your 4-digit Recovery PIN is: ${recoveryPin}\n\nKeep this safe! You will need it to reset your password if you ever forget it.`,
                [{ text: 'Got it!', onPress: () => navigation.navigate('Login') }]
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
                            <Text style={styles.title}>Create Account</Text>
                            <Text style={styles.subtitle}>Join our community of music lovers</Text>

                            <View style={styles.card}>
                                <View style={styles.inputSection}>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="person-outline" size={20} color="#666" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Full Name"
                                            placeholderTextColor="#666"
                                            value={fullName}
                                            onChangeText={setFullName}
                                        />
                                    </View>

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

                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Confirm Password"
                                            placeholderTextColor="#666"
                                            value={confirmPassword}
                                            onChangeText={setConfirmPassword}
                                            secureTextEntry={!showConfirmPassword}
                                        />
                                        <TouchableOpacity 
                                            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                            style={styles.eyeIcon}
                                        >
                                            <Ionicons 
                                                name={showConfirmPassword ? "eye-off-outline" : "eye-outline"} 
                                                size={22} 
                                                color="#666" 
                                            />
                                        </TouchableOpacity>
                                    </View>
                                    <View style={styles.inputWrapper}>
                                        <Ionicons name="shield-checkmark-outline" size={20} color="#1DB954" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Secret 4-Digit PIN"
                                            placeholderTextColor="#666"
                                            value={recoveryPin}
                                            onChangeText={(text) => setRecoveryPin(text.replace(/[^0-9]/g, '').slice(0, 4))}
                                            keyboardType="number-pad"
                                            secureTextEntry
                                            maxLength={4}
                                        />
                                    </View>
                                </View>

                                <TouchableOpacity 
                                    style={[styles.button, (!fullName || !email || !password || !confirmPassword || recoveryPin.length !== 4) && styles.buttonDisabled]} 
                                    onPress={handleRegister}
                                    disabled={loading || !fullName || !email || !password || !confirmPassword || recoveryPin.length !== 4}
                                >
                                    {loading ? (
                                        <ActivityIndicator color="#000" />
                                    ) : (
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={styles.buttonText}>Create Account</Text>
                                            <Ionicons name="person-add-outline" size={20} color="#000" style={{ marginLeft: 8 }} />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </View>

                            <View style={styles.footer}>
                                <Text style={styles.footerText}>Already have an account? </Text>
                                <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                                    <Text style={styles.linkHighlight}>Login</Text>
                                </TouchableOpacity>
                            </View>
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
        top: '10%',
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
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    scrollContainer: {
        flexGrow: 1,
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
        fontSize: 16,
        color: '#aaa',
        marginTop: 5,
        fontWeight: '500',
        marginBottom: 30,
        textAlign: 'center',
    },
    card: {
        width: '100%',
        backgroundColor: 'rgba(30, 30, 30, 0.85)',
        borderRadius: 30,
        padding: 28,
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
        marginBottom: 14,
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
        marginTop: 5,
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
        marginTop: 25,
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
});

export default RegisterScreen;
