import React, { useState, useEffect, useCallback } from 'react';
import { 
    View, Text, StyleSheet, Modal, TouchableOpacity, 
    TextInput, FlatList, ActivityIndicator, RefreshControl,
    Platform, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../supabaseClient';

const UserManagementModal = ({ visible, onClose }) => {
    const insets = useSafeAreaInsets();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [deletingId, setDeletingId] = useState(null);

    useEffect(() => {
        if (visible) {
            fetchUsers();
        }
    }, [visible]);

    const fetchUsers = async () => {
        try {
            if (!refreshing) setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('role', 'user')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (error) {
            console.error('Error fetching users:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchUsers();
    }, []);

    const handleDeleteUser = (user) => {
        Alert.alert(
            'Delete Account',
            `Are you sure you want to permanently delete the account of "${user.full_name || user.email}"?\n\nThis action cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => confirmDeleteUser(user),
                },
            ]
        );
    };

    const confirmDeleteUser = async (user) => {
        try {
            setDeletingId(user.id);

            // Get current session token
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) throw new Error('No active session. Please log in again.');

            // Call Edge Function with explicit auth header
            const response = await fetch(
                `https://kwwlulfppjqkejuskuen.supabase.co/functions/v1/delete-user`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ userId: user.id }),
                }
            );

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || `Server returned ${response.status}`);
            }

            // Remove from local state immediately
            setUsers(prev => prev.filter(u => u.id !== user.id));
            Alert.alert('Deleted', `${user.full_name || 'User'}'s account has been permanently removed.`);
        } catch (error) {
            console.error('Error deleting user:', error);
            Alert.alert('Error', error.message || 'Failed to delete user. Please try again.');
        } finally {
            setDeletingId(null);
        }
    };

    const filteredUsers = users.filter(user => {
        const query = searchQuery.toLowerCase();
        return (user.full_name?.toLowerCase().includes(query) || 
                user.email?.toLowerCase().includes(query));
    });

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const renderUserItem = ({ item }) => {
        const isDeleting = deletingId === item.id;
        return (
            <View style={styles.userItem}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarChar}>
                        {(item.full_name || item.email || '?').charAt(0).toUpperCase()}
                    </Text>
                </View>
                <View style={styles.userInfo}>
                    <Text style={styles.userName}>{item.full_name || 'Anonymous'}</Text>
                    <Text style={styles.userEmail}>{item.email}</Text>
                    <Text style={styles.joinDate}>Joined: {formatDate(item.created_at)}</Text>
                </View>
                <View style={styles.rightSection}>
                    <View style={styles.pinBadge}>
                        <Text style={styles.pinLabel}>RECOVERY PIN</Text>
                        <Text style={styles.pinText}>{item.recovery_pin || 'N/A'}</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.deleteBtn, isDeleting && styles.deleteBtnDisabled]}
                        onPress={() => handleDeleteUser(item)}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <ActivityIndicator size="small" color="#ff4444" />
                        ) : (
                            <Ionicons name="trash-outline" size={18} color="#ff4444" />
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Ionicons name="close" size={26} color="#aaa" />
                    </TouchableOpacity>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>User Management</Text>
                        <View style={styles.userCountBadge}>
                            <Text style={styles.userCountText}>{users.length}</Text>
                        </View>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                <View style={styles.searchSection}>
                    <View style={styles.searchBox}>
                        <Ionicons name="search-outline" size={18} color="#666" style={styles.searchIcon} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search by name or email..."
                            placeholderTextColor="#666"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Ionicons name="close-circle" size={18} color="#666" />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {loading && !refreshing ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color="#1DB954" />
                    </View>
                ) : (
                    <FlatList
                        data={filteredUsers}
                        keyExtractor={item => item.id}
                        renderItem={renderUserItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor="#1DB954"
                            />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="people-outline" size={60} color="#333" />
                                <Text style={styles.emptyText}>No users found</Text>
                            </View>
                        }
                    />
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0A0A0A',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        height: 60,
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F1F',
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    closeBtn: {
        padding: 5,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    userCountBadge: {
        backgroundColor: '#1DB954',
        borderRadius: 10,
        minWidth: 22,
        height: 22,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
    },
    userCountText: {
        color: '#000',
        fontSize: 11,
        fontWeight: 'bold',
    },
    searchSection: {
        padding: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F1F',
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A1A',
        borderRadius: 10,
        paddingHorizontal: 12,
        height: 45,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        color: '#fff',
        fontSize: 14,
    },
    listContent: {
        padding: 15,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#000000',
        borderRadius: 12,
        padding: 15,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#222',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    avatarChar: {
        color: '#000',
        fontSize: 20,
        fontWeight: 'bold',
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        color: '#fff',
        fontSize: 15,
        fontWeight: 'bold',
    },
    userEmail: {
        color: '#aaa',
        fontSize: 12,
        marginTop: 2,
    },
    joinDate: {
        color: '#555',
        fontSize: 10,
        marginTop: 4,
    },
    rightSection: {
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 10,
    },
    pinBadge: {
        alignItems: 'flex-end',
    },
    pinLabel: {
        color: '#1DB954',
        fontSize: 8,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    pinText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    deleteBtn: {
        width: 34,
        height: 34,
        borderRadius: 8,
        backgroundColor: 'rgba(255,68,68,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(255,68,68,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteBtnDisabled: {
        opacity: 0.5,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        alignItems: 'center',
        marginTop: 100,
    },
    emptyText: {
        color: '#555',
        fontSize: 16,
        marginTop: 15,
    },
});

export default UserManagementModal;
