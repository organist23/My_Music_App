import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Animated, Dimensions, Linking, ScrollView } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMenu } from '../context/MenuContext';
import { useNavigation } from '@react-navigation/native';
import { useChat } from '../context/ChatContext';
import ChatModal from './ChatModal';
import UserManagementModal from './UserManagementModal';

const { width } = Dimensions.get('window');

const MenuModal = ({ visible, onClose }) => {
    const insets = useSafeAreaInsets();
    const navigation = useNavigation();
    const { user, profile, logout } = useAuth();
    const { 
        storageUsage, 
        isRefreshing, 
        refreshStorageUsage 
    } = useMenu();
    const { unreadCount } = useChat();
    const [showSupport, setShowSupport] = React.useState(false);
    const [showUserSettings, setShowUserSettings] = React.useState(false);
    const [isPinVisible, setIsPinVisible] = React.useState(false);
    const [isChatVisible, setIsChatVisible] = React.useState(false);
    const [isUserManagementVisible, setIsUserManagementVisible] = React.useState(false);
    const [showAbout, setShowAbout] = React.useState(false);
    const slideAnim = React.useRef(new Animated.Value(-width)).current;

    const isAdmin = profile?.role === 'admin';

    React.useEffect(() => {
        if (visible) {
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start();
            if (isAdmin) refreshStorageUsage();
        } else {
            Animated.timing(slideAnim, {
                toValue: -width,
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, isAdmin]);

    const handleLogout = async () => {
        await logout();
        onClose();
    };

    const handleCopyPin = () => {
        import('react-native').then(({ Clipboard, Alert }) => {
            Clipboard.setString(profile?.recovery_pin || '');
            Alert.alert('Copied', 'Secret PIN copied to clipboard!');
        });
    };

    const handleSettings = () => {
        if (isAdmin) {
            onClose();
            navigation.navigate('Settings');
        } else {
            setShowUserSettings(!showUserSettings);
        }
    };
    
    const handleSupportEmail = () => {
        Linking.openURL('mailto:guimbakeiphil23@gmail.com');
    };
    
    const handleSupportFacebook = () => {
        Linking.openURL('fb://profile/keiphil.guimba').catch(() => {
            Linking.openURL('https://www.facebook.com/keiphil.guimba');
        });
    };

    const formatSize = (bytes) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const storageLimit = 1024 * 1024 * 1024; // 1GB
    const storagePercent = Math.min((storageUsage / storageLimit) * 100, 100);

    return (
        <Modal
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
            animationType="none"
        >
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
                <Animated.View style={[styles.menuContainer, { transform: [{ translateX: slideAnim }] }]}>
                    <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
                        <View style={styles.header}>
                            <View style={styles.profileIcon}>
                                <Text style={styles.profileChar}>
                                    {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                                </Text>
                            </View>
                            <View style={styles.userInfo}>
                                <Text style={styles.userName} numberOfLines={1}>{profile?.full_name || 'User'}</Text>
                                <Text style={styles.userEmail} numberOfLines={1}>{user?.email}</Text>
                            </View>
                        </View>

                        <View style={styles.divider} />

                        {isAdmin && (
                            <View style={styles.storageSection}>
                                <View style={styles.storageHeader}>
                                    <View>
                                        <Text style={styles.storageTitle}>Supabase Storage</Text>
                                        <Text style={styles.storageValue}>{formatSize(storageUsage)} / 1 GB</Text>
                                    </View>
                                    <TouchableOpacity onPress={refreshStorageUsage} disabled={isRefreshing}>
                                        <Ionicons name="refresh" size={16} color="#1DB954" />
                                    </TouchableOpacity>
                                </View>
                                <View style={styles.progressBarBg}>
                                    <View style={[styles.progressBarFill, { width: `${storagePercent}%` }]} />
                                </View>
                                <View style={styles.miniDivider} />
                            </View>
                        )}



                        <ScrollView 
                            style={styles.menuScroll} 
                            contentContainerStyle={styles.menuScrollContent}
                            showsVerticalScrollIndicator={false}
                        >
                            <View style={styles.menuItems}>
                                <TouchableOpacity style={styles.menuItem} onPress={onClose}>
                                    <Ionicons name="person-outline" size={22} color="#fff" />
                                    <Text style={styles.menuText}>View Profile</Text>
                                </TouchableOpacity>
                                
                                <View>
                                    <TouchableOpacity style={styles.menuItem} onPress={handleSettings}>
                                        <Ionicons name="settings-outline" size={22} color="#fff" />
                                        <Text style={styles.menuText}>Settings</Text>
                                    </TouchableOpacity>

                                    {!isAdmin && showUserSettings && (
                                        <View style={styles.expandedSupport}>
                                            <View style={styles.recoveryCodeRow}>
                                                <View style={styles.codeContainer}>
                                                    <Text style={styles.codeLabel}>YOUR SECRET RECOVERY PIN</Text>
                                                    <Text style={styles.codeValue}>
                                                        {isPinVisible ? profile?.recovery_pin : '****'}
                                                    </Text>
                                                </View>
                                                <View style={styles.codeActions}>
                                                    <TouchableOpacity 
                                                        style={styles.codeActionBtn} 
                                                        onPress={() => setIsPinVisible(!isPinVisible)}
                                                    >
                                                        <Ionicons name={isPinVisible ? "eye-off" : "eye"} size={20} color="#aaa" />
                                                    </TouchableOpacity>
                                                    <TouchableOpacity style={styles.codeActionBtn} onPress={handleCopyPin}>
                                                        <Ionicons name="copy-outline" size={20} color="#1DB954" />
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                            <Text style={styles.recoveryHint}>Keep this safe! Use it to reset your password if you ever forget it.</Text>
                                        </View>
                                    )}
                                </View>
                                
                                {!isAdmin && (
                                    <View>
                                        <TouchableOpacity 
                                            style={styles.menuItem} 
                                            onPress={() => setShowSupport(!showSupport)}
                                        >
                                            <View style={styles.menuItemMain}>
                                                <Ionicons name="help-circle-outline" size={22} color="#fff" />
                                                <Text style={styles.menuText}>Support</Text>
                                            </View>
                                        </TouchableOpacity>

                                        {showSupport && (
                                            <View style={styles.expandedSupport}>
                                                <TouchableOpacity style={styles.supportSubItem} onPress={handleSupportEmail}>
                                                    <Ionicons name="mail" size={18} color="#1DB954" />
                                                    <View style={styles.supportSubInfo}>
                                                        <Text style={styles.supportSubLabel}>Email Support</Text>
                                                        <Text style={styles.supportSubText}>guimbakeiphil23@gmail.com</Text>
                                                    </View>
                                                </TouchableOpacity>
                                                
                                                <TouchableOpacity style={styles.supportSubItem} onPress={handleSupportFacebook}>
                                                    <Ionicons name="logo-facebook" size={18} color="#1DB954" />
                                                    <View style={styles.supportSubInfo}>
                                                        <Text style={styles.supportSubLabel}>Facebook Page</Text>
                                                        <Text style={styles.supportSubText}>Keiphil P. Guimba</Text>
                                                    </View>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                )}
                                <View>
                                    <TouchableOpacity 
                                        style={styles.menuItem} 
                                        onPress={() => {
                                            setIsChatVisible(true);
                                        }}
                                    >
                                        <View style={styles.menuItemMain}>
                                            <Ionicons name="chatbubbles-outline" size={22} color="#fff" />
                                            <Text style={styles.menuText}>
                                                {isAdmin ? 'Messages' : 'Chat with Admin'}
                                            </Text>
                                            {unreadCount > 0 && (
                                                <View style={styles.badge}>
                                                    <Text style={styles.badgeText}>{unreadCount}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                </View>

                                {isAdmin && (
                                    <View>
                                        <TouchableOpacity 
                                            style={styles.menuItem} 
                                            onPress={() => setIsUserManagementVisible(true)}
                                        >
                                            <View style={styles.menuItemMain}>
                                                <Ionicons name="people-outline" size={22} color="#1DB954" />
                                                <Text style={styles.menuText}>User Management</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                )}

                                {!isAdmin && (
                                    <View>
                                        <TouchableOpacity 
                                            style={styles.menuItem} 
                                            onPress={() => setShowAbout(!showAbout)}
                                        >
                                            <View style={styles.menuItemMain}>
                                                <Ionicons name="information-circle-outline" size={22} color="#fff" />
                                                <Text style={styles.menuText}>About Creator</Text>
                                            </View>
                                        </TouchableOpacity>

                                        {showAbout && (
                                            <View style={styles.expandedAbout}>
                                                <Text style={styles.aboutName}>Keiphil P. Guimba</Text>
                                                <Text style={styles.aboutTitle}>Self-Taught Developer & Music Enthusiast</Text>
                                                <Text style={styles.aboutText}>
                                                    I am Keiphil, a self-taught developer whose heart beats to the rhythm of music. 
                                                    For me, technology and sound are inseparable—both are languages used to create, 
                                                    connect, and inspire. 
                                                    {"\n\n"}
                                                    I built this application with one goal in mind: to provide a premium space for music 
                                                    lovers where every note can be appreciated in its purest form. Whether it's the 
                                                    smooth playback or the curated favorites, this project is a labor of love dedicated 
                                                    to the art of sound.
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        </ScrollView>

                        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                            <Ionicons name="log-out-outline" size={22} color="#ff4444" />
                            <Text style={styles.logoutText}>Log Out</Text>
                        </TouchableOpacity>

                        <View style={styles.versionContainer}>
                            <Text style={styles.versionText}>Version 4.1.2</Text>
                        </View>
                    </View>
                </Animated.View>
            </View>

            <ChatModal 
                visible={isChatVisible} 
                onClose={() => setIsChatVisible(false)} 
            />

            <UserManagementModal
                visible={isUserManagementVisible}
                onClose={() => setIsUserManagementVisible(false)}
            />
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        flexDirection: 'row',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    menuContainer: {
        width: width * 0.75,
        height: '100%',
        backgroundColor: '#1E1E1E',
        padding: 20,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 30,
    },
    profileIcon: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
    },
    profileChar: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    userInfo: {
        marginLeft: 15,
        flex: 1,
    },
    userName: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    userEmail: {
        color: '#aaa',
        fontSize: 12,
        marginTop: 2,
    },
    divider: {
        height: 1,
        backgroundColor: '#333',
        marginBottom: 10,
    },
    menuScroll: {
        flex: 1,
    },
    menuScrollContent: {
        flexGrow: 1,
    },
    menuItems: {
        paddingBottom: 20,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        marginBottom: 10,
    },
    menuText: {
        color: '#fff',
        fontSize: 16,
        marginLeft: 15,
    },
    logoutBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    logoutText: {
        color: '#ff4444',
        fontSize: 16,
        fontWeight: 'bold',
        marginLeft: 15,
    },
    adminActionText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
    storageSection: {
        marginBottom: 20,
    },
    storageHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    storageTitle: {
        color: '#aaa',
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    storageValue: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        marginTop: 2,
    },
    progressBarBg: {
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#1DB954',
    },
    miniDivider: {
        height: 1,
        backgroundColor: '#333',
        marginTop: 20,
    },
    menuItemMain: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    expandedSupport: {
        backgroundColor: 'rgba(29, 185, 84, 0.05)',
        borderRadius: 12,
        padding: 10,
        marginBottom: 10,
        marginLeft: 10,
    },
    supportSubItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 5,
    },
    supportSubInfo: {
        marginLeft: 12,
    },
    supportSubLabel: {
        color: '#aaa',
        fontSize: 10,
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    supportSubText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '500',
    },
    versionContainer: {
        marginTop: 'auto',
        alignItems: 'center',
        paddingVertical: 10,
    },
    versionText: {
        color: '#444',
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    recoveryCodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 5,
    },
    codeContainer: {
        flex: 1,
    },
    codeLabel: {
        color: '#ff4444',
        fontSize: 8,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    codeValue: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        letterSpacing: 2,
    },
    codeActions: {
        flexDirection: 'row',
    },
    codeActionBtn: {
        padding: 8,
        marginLeft: 5,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 8,
    },
    recoveryHint: {
        color: '#666',
        fontSize: 10,
        marginTop: 10,
        paddingHorizontal: 5,
        fontStyle: 'italic',
    },
    badge: {
        backgroundColor: '#1DB954',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
        paddingHorizontal: 6,
    },
    badgeText: {
        color: '#000',
        fontSize: 10,
        fontWeight: 'bold',
    },
    expandedAbout: {
        backgroundColor: 'rgba(29, 185, 84, 0.05)',
        borderRadius: 12,
        padding: 15,
        marginBottom: 10,
        marginLeft: 10,
        borderLeftWidth: 2,
        borderLeftColor: '#1DB954',
    },
    aboutName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    aboutTitle: {
        color: '#1DB954',
        fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 10,
        letterSpacing: 1,
    },
    aboutText: {
        color: '#ccc',
        fontSize: 13,
        lineHeight: 20,
        fontStyle: 'italic',
    },
});

export default MenuModal;
