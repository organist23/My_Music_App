import React, { useState, useEffect, useRef } from 'react';
import { 
    View, Text, StyleSheet, Modal, TouchableOpacity, 
    TextInput, FlatList, KeyboardAvoidingView, Platform,
    ActivityIndicator, Image, Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';
import { usePlayer } from '../context/PlayerContext';
import { supabase } from '../supabaseClient';

const ChatModal = ({ visible, onClose }) => {
    const insets = useSafeAreaInsets();
    const { user, profile } = useAuth();
    const { 
        messages, sendMessage, loading, inbox, 
        activeChatUser, setActiveChatUser, fetchMessages, refreshInbox,
        markAsRead, unsendMessage, togglePinMessage, clearChat, clearAllChats,
        pendingMessages, retryMessage, deletePendingMessage
    } = useChat();
    const { favorites } = useFavorites();
    const { 
        playTrack, togglePlayPause, seek,
        currentTrack, isPlaying, isBuffering, position, duration,
        isLoading, loadingTrackId 
    } = usePlayer();
    
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [showMusicPicker, setShowMusicPicker] = useState(false);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [showActionModal, setShowActionModal] = useState(false);
    const [selectedInboxUser, setSelectedInboxUser] = useState(null);
    const [showInboxActionModal, setShowInboxActionModal] = useState(false);
    const [searchQueryInbox, setSearchQueryInbox] = useState('');
    const flatListRef = useRef(null);

    const isAdmin = profile?.role === 'admin';

    useEffect(() => {
        if (visible) {
            if (isAdmin) {
                refreshInbox();
                if (activeChatUser) {
                    markAsRead(activeChatUser.id);
                }
            } else {
                fetchMessages();
                // Find admin ID and mark as read
                fetchAdminIdAndMarkRead();
            }
        }
    }, [visible, activeChatUser]);

    const fetchAdminIdAndMarkRead = async () => {
        try {
            const { data } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'admin')
                .single();
            if (data) markAsRead(data.id);
        } catch (e) {
            console.error('Error in fetchAdminIdAndMarkRead:', e);
        }
    };

    const formatTime = (ms) => {
        if (!ms || isNaN(ms)) return '0:00';
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const handleSend = async () => {
        if (!inputText.trim() || isSending) return;
        
        const messageText = inputText.trim();
        setInputText(''); // Clear immediately for better UX
        setIsSending(true);
        try {
            await sendMessage(messageText);
            // Scroll to bottom after sending
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        } catch (error) {
            console.error('Send error:', error);
            // If it failed immediately (e.g. no internet check), we might want to put text back?
            // Actually, the pending system handles it now.
        } finally {
            setIsSending(false);
        }
    };

    const handleSelectUser = (selectedUser) => {
        setActiveChatUser(selectedUser);
    };

    const handleShareMusic = async (track) => {
        setShowMusicPicker(false);
        try {
            await sendMessage('', null, {
                type: 'music',
                track: track
            });
            // Scroll to bottom after sharing
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        } catch (e) {
            console.error('Error sharing music:', e);
        }
    };

    const handleUnsend = (messageId) => {
        Alert.alert(
            "Unsend Message",
            "Are you sure you want to unsend this message for everyone?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Unsend", onPress: () => unsendMessage(messageId), style: "destructive" }
            ]
        );
    };

    const handleDeleteInbox = (selectedUser) => {
        if (!selectedUser) return;
        Alert.alert(
            "Clear Chat",
            `Are you sure you want to delete all messages with ${selectedUser.full_name || 'this user'}? This action cannot be undone.`,
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Clear Chat", 
                    onPress: async () => {
                        try {
                            await clearChat(selectedUser.id);
                        } catch (e) {
                            Alert.alert("Error", "Failed to clear chat.");
                        }
                    }, 
                    style: "destructive" 
                }
            ]
        );
    };

    const handleClearAll = () => {
        Alert.alert(
            "Clear All Conversations",
            "Are you sure you want to clear your entire message history? This will delete ALL conversations for you. This cannot be undone.",
            [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Clear All", 
                    onPress: async () => {
                        try {
                            await clearAllChats();
                        } catch (e) {
                            Alert.alert("Error", "Failed to clear conversations.");
                        }
                    }, 
                    style: "destructive" 
                }
            ]
        );
    };

    const handleTogglePin = async (message) => {
        try {
            await togglePinMessage(message.id, message.is_pinned);
        } catch (error) {
            console.error('Pin error:', error);
        }
    };

    const renderMessage = ({ item }) => {
        const isMine = item.sender_id === user.id;
        const showName = isAdmin && !isMine && activeChatUser;
        const hasMusic = item.payload?.type === 'music';
        const track = item.payload?.track;
        const isPending = !!item.status;
        const isFailed = item.status === 'failed';
        const isSending = item.status === 'sending';

        const getStatusIcon = () => {
            if (!isMine) return null;
            if (isSending) return <Ionicons name="ellipse-outline" size={12} color="rgba(0,0,0,0.3)" />;
            if (isFailed) return <Ionicons name="alert-circle" size={16} color="#B00020" />;
            if (item.is_read) return <Ionicons name="checkmark-done" size={14} color="#000" />;
            return <Ionicons name="checkmark" size={14} color="rgba(0,0,0,0.4)" />;
        };

        return (
            <View style={[styles.messageRow, isMine ? styles.myMessageRow : styles.theirMessageRow]}>
                <View style={[styles.bubbleContainer, isMine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
                    <TouchableOpacity 
                        style={[
                            styles.bubble, 
                            isMine ? styles.myBubble : styles.theirBubble, 
                            item.is_pinned && styles.pinnedBubble,
                            isFailed && styles.failedBubble
                        ]}
                        onLongPress={() => {
                            if (!isPending) {
                                setSelectedMessage(item);
                                setShowActionModal(true);
                            }
                        }}
                        activeOpacity={0.8}
                    >
                        {item.is_pinned && (
                            <View style={styles.pinIndicator}>
                                <Ionicons name="pin" size={12} color="#1DB954" />
                                <Text style={styles.pinIndicatorText}>Pinned</Text>
                            </View>
                        )}
                        {showName && (
                            <Text style={styles.senderName}>{activeChatUser.full_name || 'User'}</Text>
                        )}
                        
                        {hasMusic && track && (
                            <View style={styles.musicCardContainer}>
                                <TouchableOpacity 
                                    style={styles.musicCard}
                                    onPress={() => {
                                        if (currentTrack?.id === track.id) {
                                            togglePlayPause();
                                        } else {
                                            playTrack(track, [track]);
                                        }
                                    }}
                                    activeOpacity={0.7}
                                >
                                {track.cover_url && (
                                    <Image source={{ uri: track.cover_url }} style={styles.musicCardThumb} />
                                ) || (
                                    <View style={[styles.musicCardThumb, { backgroundColor: '#333', justifyContent: 'center', alignItems: 'center' }]}>
                                        <Ionicons name="musical-note" size={24} color="#555" />
                                    </View>
                                )}
                                <View style={styles.musicDetails}>
                                    <Text style={styles.musicTitle} numberOfLines={1}>{track.title}</Text>
                                    <Text style={styles.musicArtist} numberOfLines={1}>
                                        {track.artist || 'Original Composition'}
                                        {track.genre ? ` • ${track.genre}` : ''}
                                    </Text>
                                </View>
                                <View style={styles.musicIconContainer}>
                                    {(isBuffering || (isLoading && loadingTrackId === track.id)) && currentTrack?.id === track.id ? (
                                        <ActivityIndicator size="small" color="#1DB954" />
                                    ) : (
                                        <Ionicons 
                                            name={currentTrack?.id === track.id && isPlaying ? "pause" : "play"} 
                                            size={22} 
                                            color="#1DB954" 
                                        />
                                    )}
                                </View>
                            </TouchableOpacity>

                            {currentTrack?.id === track.id && (
                                <View style={styles.miniProgressArea}>
                                    <View style={styles.miniTimeRow}>
                                        <Text style={styles.miniTimeText}>{formatTime(position)}</Text>
                                        <Text style={styles.miniTimeText}>{formatTime(duration)}</Text>
                                    </View>
                                    <TouchableOpacity 
                                        style={styles.miniProgressContainer}
                                        activeOpacity={1}
                                        onPress={(e) => {
                                            const { locationX } = e.nativeEvent;
                                            const totalWidth = 230; 
                                            const progress = locationX / totalWidth;
                                            seek(progress * duration);
                                        }}
                                    >
                                        <View style={styles.miniProgressBar}>
                                            <View style={[styles.miniProgressFill, { width: `${(position / duration) * 100 || 0}%` }]} />
                                        </View>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}

                    {item.content ? (
                            <Text style={[styles.messageText, isMine ? styles.myText : styles.theirText]}>
                                {item.content.replace(/^Sharing: .*/, '').trim()}
                            </Text>
                        ) : null}
                        
                        <View style={styles.messageFooter}>
                            <Text style={[
                                styles.timeText, 
                                isMine && !item.is_pinned && { color: 'rgba(0,0,0,0.5)' },
                                (item.is_pinned || !isMine) && { color: 'rgba(255,255,255,0.6)' }
                            ]}>
                                {new Date(item.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
                            </Text>
                            {isMine && (
                                <View style={styles.statusContainer}>
                                    {getStatusIcon()}
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>

                    {isFailed && (
                        <View style={styles.failedActionsRow}>
                            <TouchableOpacity onPress={() => retryMessage(item.id)} style={styles.miniActionBtn}>
                                <Ionicons name="refresh" size={14} color="#1DB954" />
                                <Text style={styles.miniActionText}>Retry</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => deletePendingMessage(item.id)} style={styles.miniActionBtn}>
                                <Ionicons name="trash-outline" size={14} color="#ff4444" />
                                <Text style={[styles.miniActionText, { color: '#ff4444' }]}>Delete</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        );
    };

    const renderInboxItem = ({ item }) => (
        <TouchableOpacity 
            style={styles.inboxItem} 
            onPress={() => handleSelectUser(item)}
            onLongPress={() => {
                setSelectedInboxUser(item);
                setShowInboxActionModal(true);
            }}
            delayLongPress={500}
        >
            <View style={styles.inboxAvatar}>
                <Text style={styles.avatarText}>{item.full_name?.charAt(0) || 'U'}</Text>
            </View>
            <View style={styles.inboxInfo}>
                <View style={styles.inboxHeaderRow}>
                    <Text style={styles.inboxName} numberOfLines={1}>{item.full_name || 'Anonymous'}</Text>
                    {item.lastTime && (
                        <Text style={styles.inboxTime}>
                            {new Date(item.lastTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </Text>
                    )}
                </View>
                <View style={styles.inboxFooterRow}>
                    <Text style={styles.inboxPreview} numberOfLines={1}>
                        {item.lastMessage || item.email}
                    </Text>
                    {item.unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>
                                {item.unreadCount > 99 ? '99+' : item.unreadCount}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#333" style={{ marginLeft: 10 }} />
        </TouchableOpacity>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {isAdmin && activeChatUser ? (
                            <TouchableOpacity onPress={() => setActiveChatUser(null)} style={styles.iconBtn}>
                                <Ionicons name="arrow-back" size={24} color="#fff" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                                <Ionicons name="close" size={26} color="#aaa" />
                            </TouchableOpacity>
                        )}
                    </View>
                    
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {isAdmin ? (activeChatUser ? activeChatUser.full_name : "Messages") : "Admin Chat"}
                        </Text>
                        {activeChatUser && isAdmin && <View style={styles.onlineDot} />}
                    </View>

                    <View style={styles.headerRight}>
                        {isAdmin && !activeChatUser ? (
                            <TouchableOpacity onPress={handleClearAll} style={styles.iconBtn}>
                                <Ionicons name="trash-outline" size={22} color="#ff4444" />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.headerSpacer} />
                        )}
                    </View>
                </View>

                {isAdmin && !activeChatUser && (
                    <View style={styles.inboxSearchContainer}>
                        <View style={styles.inboxSearchBox}>
                            <Ionicons name="search-outline" size={18} color="#666" style={styles.searchIcon} />
                            <TextInput
                                style={styles.inboxSearchInput}
                                placeholder="Search by name or email..."
                                placeholderTextColor="#666"
                                value={searchQueryInbox}
                                onChangeText={setSearchQueryInbox}
                                autoCapitalize="none"
                            />
                            {searchQueryInbox.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQueryInbox('')}>
                                    <Ionicons name="close-circle" size={18} color="#666" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}

                {isAdmin && !activeChatUser ? (
                    (() => {
                        const filteredInbox = inbox.filter(item => {
                            const query = searchQueryInbox.toLowerCase();
                            return (
                                item.full_name?.toLowerCase().includes(query) ||
                                item.email?.toLowerCase().includes(query)
                            );
                        });

                        return (
                            <FlatList
                                data={filteredInbox}
                                keyExtractor={item => item.id}
                                renderItem={renderInboxItem}
                                style={styles.messageList}
                                ListEmptyComponent={
                                    <View style={styles.emptyContainer}>
                                        <Ionicons name="chatbubbles-outline" size={64} color="#333" />
                                        <Text style={styles.emptyText}>
                                            {searchQueryInbox ? "No users found." : "No messages yet."}
                                        </Text>
                                    </View>
                                }
                            />
                        );
                    })()
                ) : (
                    // Conversation View
                    <KeyboardAvoidingView 
                        style={styles.chatArea} 
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 50 : 0}
                    >
                        {messages.some(m => m.is_pinned) && (
                            <View style={styles.pinnedHeader}>
                                <Ionicons name="pin" size={16} color="#1DB954" />
                                <FlatList
                                    data={messages.filter(m => m.is_pinned)}
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    keyExtractor={m => m.id}
                                    style={{ marginLeft: 5 }}
                                    renderItem={({ item, index }) => (
                                        <TouchableOpacity 
                                            style={styles.pinnedTag}
                                            onPress={() => {
                                                const mIndex = messages.findIndex(m => m.id === item.id);
                                                if (mIndex !== -1) {
                                                    flatListRef.current?.scrollToIndex({ 
                                                        index: mIndex, 
                                                        animated: true,
                                                        viewPosition: 0.5 
                                                    });
                                                }
                                            }}
                                        >
                                            <Text style={styles.pinnedTagText} numberOfLines={1}>
                                                {item.payload?.type === 'music' ? `🎵 ${item.payload.track.title}` : item.content}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                />
                            </View>
                        )}
                        <FlatList
                            ref={flatListRef}
                            data={[
                                ...messages,
                                ...pendingMessages.filter(pm => {
                                    if (!user) return false;
                                    // Make sure we only show pending messages for the CURRENT conversation
                                    if (isAdmin) {
                                        return pm.receiver_id === activeChatUser?.id;
                                    } else {
                                        // User only chats with one admin
                                        return pm.sender_id === user.id;
                                    }
                                })
                            ].sort((a, b) => {
                                const dateA = new Date(a.created_at);
                                const dateB = new Date(b.created_at);
                                return dateA - dateB;
                            })}
                            keyExtractor={item => item.id}
                            renderItem={renderMessage}
                            contentContainerStyle={styles.messageListContent}
                            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                            onScrollToIndexFailed={info => {
                                const wait = new Promise(resolve => setTimeout(resolve, 500));
                                wait.then(() => {
                                    flatListRef.current?.scrollToIndex({ index: info.index, animated: true });
                                });
                            }}
                        />
                        
                        <View style={[styles.inputWrapper, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 10) : 10 }]}>
                            <View style={styles.inputOuter}>
                                {!isAdmin && (
                                    <TouchableOpacity 
                                        style={styles.attachBtn}
                                        onPress={() => setShowMusicPicker(true)}
                                    >
                                        <Ionicons name="musical-notes" size={24} color="#1DB954" />
                                    </TouchableOpacity>
                                )}
                                <TextInput
                                    style={styles.input}
                                    placeholder="Type a message..."
                                    placeholderTextColor="#666"
                                    value={inputText}
                                    onChangeText={setInputText}
                                    multiline
                                />
                                <TouchableOpacity 
                                    style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]} 
                                    onPress={handleSend}
                                    disabled={!inputText.trim() || isSending}
                                >
                                    {isSending ? (
                                        <ActivityIndicator size="small" color="#000" />
                                    ) : (
                                        <Ionicons name="arrow-up" size={22} color="#000" />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                )}

                {/* Music Picker Modal */}
                <Modal visible={showMusicPicker} transparent animationType="slide">
                    <View style={styles.pickerOverlay}>
                        <View style={styles.pickerContent}>
                            <View style={styles.pickerHeader}>
                                <Text style={styles.pickerTitle}>Select Music from Favorites</Text>
                                <TouchableOpacity onPress={() => setShowMusicPicker(false)}>
                                    <Ionicons name="close" size={24} color="#fff" />
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={favorites}
                                keyExtractor={item => item.id}
                                renderItem={({ item }) => {
                                    const isCurrent = currentTrack?.id === item.music.id;
                                    return (
                                        <View style={styles.pickerItemContainer}>
                                            <TouchableOpacity 
                                                style={styles.pickerItem}
                                                onPress={() => handleShareMusic(item.music)}
                                            >
                                                {item.music.cover_url ? (
                                                    <Image source={{ uri: item.music.cover_url }} style={styles.pickerThumb} />
                                                ) : (
                                                    <View style={styles.pickerIcon}>
                                                        <Ionicons name="musical-note" size={20} color="#1DB954" />
                                                    </View>
                                                )}
                                                <View style={styles.pickerInfo}>
                                                    <Text style={styles.pickerName} numberOfLines={1}>{item.music.title}</Text>
                                                    <View style={styles.pickerMetaRow}>
                                                        <Text style={styles.pickerArtist} numberOfLines={1}>
                                                            {item.music.artist || 'Original'}
                                                            {item.music.genre ? ` • ${item.music.genre}` : ''}
                                                        </Text>
                                                        <Text style={styles.pickerDuration}>
                                                            {isCurrent ? formatTime(duration) : (item.music.duration ? formatTime(item.music.duration) : '--:--')}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </TouchableOpacity>

                                            <TouchableOpacity 
                                                style={styles.pickerPlayBtn}
                                                onPress={() => {
                                                    if (isCurrent) {
                                                        togglePlayPause();
                                                    } else {
                                                        playTrack(item.music, [item.music]);
                                                    }
                                                }}
                                            >
                                                {(isBuffering || (isLoading && loadingTrackId === item.music.id)) && isCurrent ? (
                                                    <ActivityIndicator size="small" color="#1DB954" />
                                                ) : (
                                                    <Ionicons 
                                                        name={isCurrent && isPlaying ? "pause" : "play"} 
                                                        size={24} 
                                                        color="#1DB954" 
                                                    />
                                                )}
                                            </TouchableOpacity>
                                        </View>
                                    );
                                }}
                                ListEmptyComponent={
                                    <View style={styles.emptyPicker}>
                                        <Text style={styles.emptyPickerText}>No favorites yet.</Text>
                                    </View>
                                }
                            />
                        </View>
                    </View>
                </Modal>

                {/* Message Action Modal */}
                <Modal visible={showActionModal} transparent animationType="fade">
                    <TouchableOpacity 
                        style={styles.actionOverlay} 
                        activeOpacity={1} 
                        onPress={() => setShowActionModal(false)}
                    >
                        <View style={styles.actionSheet}>
                            <View style={styles.actionHeader}>
                                <Text style={styles.actionTitle}>Message Options</Text>
                            </View>

                            <TouchableOpacity 
                                style={styles.actionItem} 
                                onPress={() => {
                                    handleTogglePin(selectedMessage);
                                    setShowActionModal(false);
                                }}
                            >
                                <Ionicons name="pin-outline" size={20} color="#fff" />
                                <Text style={styles.actionText}>
                                    {selectedMessage?.is_pinned ? 'Unpin Message' : 'Pin Message'}
                                </Text>
                            </TouchableOpacity>

                            {selectedMessage?.sender_id === user?.id && (
                                <TouchableOpacity 
                                    style={styles.actionItem} 
                                    onPress={() => {
                                        handleUnsend(selectedMessage.id);
                                        setShowActionModal(false);
                                    }}
                                >
                                    <Ionicons name="trash-outline" size={20} color="#ff4444" />
                                    <Text style={[styles.actionText, { color: '#ff4444' }]}>Unsend Message</Text>
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity 
                                style={[styles.actionItem, styles.cancelAction]} 
                                onPress={() => setShowActionModal(false)}
                            >
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>
                
                {/* Inbox Action Modal */}
                <Modal
                    visible={showInboxActionModal}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowInboxActionModal(false)}
                >
                    <TouchableOpacity 
                        style={styles.actionOverlay} 
                        activeOpacity={1} 
                        onPress={() => setShowInboxActionModal(false)}
                    >
                        <View style={styles.actionSheet}>
                            <View style={styles.actionHeader}>
                                <Text style={styles.actionTitle}>Chat Management</Text>
                                <Text style={[styles.actionTitle, { fontSize: 12, marginTop: 5, color: '#666' }]}>
                                    {selectedInboxUser?.full_name || selectedInboxUser?.email}
                                </Text>
                            </View>

                            <TouchableOpacity 
                                style={styles.actionItem} 
                                onPress={() => {
                                    setShowInboxActionModal(false);
                                    handleDeleteInbox(selectedInboxUser);
                                }}
                            >
                                <Ionicons name="trash-outline" size={20} color="#ff4444" />
                                <Text style={[styles.actionText, { color: '#ff4444' }]}>Clear Chat History</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={[styles.actionItem, styles.cancelAction]} 
                                onPress={() => setShowInboxActionModal(false)}
                            >
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </Modal>
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
        paddingHorizontal: 4,
        height: 50,
        backgroundColor: '#121212',
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F1F',
    },
    headerLeft: {
        width: 40,
        alignItems: 'center',
    },
    headerCenter: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerRight: {
        width: 40,
        alignItems: 'center',
    },
    headerTitle: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    headerSpacer: {
        width: 24,
    },
    iconBtn: {
        padding: 5,
    },
    onlineDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#1DB954',
        marginLeft: 8,
    },
    chatArea: {
        flex: 1,
    },
    messageListContent: {
        padding: 16,
        paddingBottom: 24,
    },
    messageRow: {
        marginVertical: 4,
        flexDirection: 'row',
        width: '100%',
    },
    myMessageRow: {
        justifyContent: 'flex-end',
    },
    theirMessageRow: {
        justifyContent: 'flex-start',
    },
    bubble: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 1,
    },
    myBubble: {
        backgroundColor: '#1DB954',
        borderBottomRightRadius: 4,
    },
    theirBubble: {
        backgroundColor: '#1F1F1F',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: '#2A2A2A',
    },
    senderName: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#1DB954',
        marginBottom: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20,
    },
    myText: {
        color: '#fff',
        fontWeight: '600',
    },
    theirText: {
        color: '#E0E0E0',
    },
    timeText: {
        fontSize: 9,
        color: '#777',
        marginTop: 4,
    },
    inputWrapper: {
        backgroundColor: '#121212',
        borderTopWidth: 1,
        borderTopColor: '#1F1F1F',
        paddingTop: 12,
        paddingHorizontal: 12,
    },
    inputOuter: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1F1F1F',
        borderRadius: 28,
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: '#2A2A2A',
    },
    attachBtn: {
        width: 36,
        height: 36,
        justifyContent: 'center',
        alignItems: 'center',
    },
    input: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
        paddingHorizontal: 12,
        maxHeight: 100,
        paddingVertical: 8,
    },
    sendBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1DB954',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 3,
    },
    sendBtnDisabled: {
        backgroundColor: '#2A2A2A',
        shadowOpacity: 0,
        elevation: 0,
    },
    inboxItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#121212',
        marginBottom: 1,
    },
    inboxAvatar: {
        width: 54,
        height: 54,
        borderRadius: 27,
        backgroundColor: '#1F1F1F',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: '#2A2A2A',
    },
    avatarText: {
        color: '#1DB954',
        fontSize: 22,
        fontWeight: '800',
    },
    inboxInfo: {
        flex: 1,
        marginLeft: 16,
    },
    inboxName: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        flex: 1,
    },
    inboxHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    inboxPreview: {
        color: '#888',
        fontSize: 13,
        flex: 1,
    },
    inboxFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 4,
    },
    unreadBadge: {
        backgroundColor: '#1DB954',
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
        marginLeft: 8,
    },
    unreadBadgeText: {
        color: '#000',
        fontSize: 11,
        fontWeight: 'bold',
    },
    inboxTime: {
        color: '#555',
        fontSize: 10,
        fontWeight: 'bold',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: '50%',
        paddingHorizontal: 40,
    },
    emptyText: {
        color: '#555',
        marginTop: 16,
        fontSize: 16,
        textAlign: 'center',
        fontWeight: '500',
    },
    // Music Card Styles
    musicCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 12,
        padding: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.15)',
    },
    musicIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    musicCardThumb: {
        width: 45,
        height: 45,
        borderRadius: 6,
        marginRight: 10,
        backgroundColor: '#1A1A1A',
    },
    musicDetails: {
        flex: 1,
        marginRight: 10,
    },
    musicTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        flexShrink: 1,
    },
    musicArtist: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginTop: 1,
        flexShrink: 1,
    },
    musicCardContainer: {
        width: 230,
        marginBottom: 8,
    },
    miniProgressArea: {
        marginTop: -5,
        paddingBottom: 8,
        paddingHorizontal: 5,
    },
    miniTimeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3,
    },
    miniTimeText: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: 'bold',
    },
    miniProgressContainer: {
        height: 12,
        justifyContent: 'center',
    },
    miniProgressBar: {
        height: 4,
        backgroundColor: 'rgba(0,0,0,0.25)',
        borderRadius: 2,
        width: '100%',
        overflow: 'hidden',
    },
    miniProgressFill: {
        height: '100%',
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 2,
    },
    pinnedBubble: {
        borderWidth: 1.5,
        borderColor: '#1DB954',
        backgroundColor: '#191919',
        shadowColor: '#1DB954',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    pinIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    pinIndicatorText: {
        fontSize: 10,
        color: '#1DB954',
        marginLeft: 4,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    pinnedHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#050505',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F1F',
    },
    pinnedTag: {
        backgroundColor: '#121212',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        marginLeft: 8,
        maxWidth: 160,
        borderWidth: 1,
        borderColor: '#1DB954',
    },
    pinnedTagText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    actionOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    actionSheet: {
        backgroundColor: '#1A1A1A',
        borderRadius: 20,
        width: '100%',
        maxWidth: 300,
        overflow: 'hidden',
    },
    actionHeader: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#252525',
        alignItems: 'center',
    },
    actionTitle: {
        color: '#aaa',
        fontSize: 14,
        fontWeight: '600',
    },
    actionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#252525',
    },
    actionText: {
        color: '#fff',
        fontSize: 16,
        marginLeft: 15,
    },
    cancelAction: {
        borderBottomWidth: 0,
        justifyContent: 'center',
    },
    cancelText: {
        color: '#777',
        fontSize: 16,
    },
    // Picker Styles
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'flex-end',
    },
    pickerContent: {
        backgroundColor: '#121212',
        borderTopLeftRadius: 25,
        borderTopRightRadius: 25,
        height: '70%',
        paddingTop: 20,
    },
    pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F1F',
    },
    pickerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    pickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 20,
        flex: 1,
    },
    pickerItemContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F1F',
    },
    pickerThumb: {
        width: 50,
        height: 50,
        borderRadius: 4,
        marginRight: 15,
        backgroundColor: '#1A1A1A',
    },
    pickerIcon: {
        width: 50,
        height: 50,
        borderRadius: 4,
        backgroundColor: '#1A1A1A',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    pickerInfo: {
        flex: 1,
    },
    pickerPlayBtn: {
        padding: 15,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerName: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    pickerArtist: {
        color: '#777',
        fontSize: 13,
        marginTop: 2,
        flex: 1,
    },
    pickerMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 2,
    },
    pickerDuration: {
        color: '#555',
        fontSize: 12,
        marginLeft: 10,
    },
    emptyPicker: {
        padding: 40,
        alignItems: 'center',
    },
    emptyPickerText: {
        color: '#555',
        fontSize: 14,
    },
    messageFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 4,
    },
    statusContainer: {
        marginLeft: 6,
    },
    bubbleContainer: {
        maxWidth: '85%',
    },
    failedBubble: {
        borderWidth: 1,
        borderColor: '#ff4444',
        opacity: 0.9,
    },
    failedActionsRow: {
        flexDirection: 'row',
        marginTop: 5,
        justifyContent: 'flex-start',
        alignItems: 'center',
    },
    miniActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 15,
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: 12,
    },
    miniActionText: {
        color: '#1DB954',
        fontSize: 11,
        fontWeight: 'bold',
        marginLeft: 4,
    },
    retryBtn: {
        paddingVertical: 4,
        paddingHorizontal: 12,
    },
    retryText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    inboxSearchContainer: {
        paddingHorizontal: 15,
        paddingBottom: 10,
        backgroundColor: '#121212',
        borderBottomWidth: 1,
        borderBottomColor: '#1F1F1F',
    },
    inboxSearchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A1A',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 40,
        borderWidth: 1,
        borderColor: '#333',
    },
    searchIcon: {
        marginRight: 8,
    },
    inboxSearchInput: {
        flex: 1,
        color: '#fff',
        fontSize: 14,
        padding: 0,
    },
});

export default ChatModal;
