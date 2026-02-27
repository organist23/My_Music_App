import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

const ChatContext = createContext({});

export const ChatProvider = ({ children }) => {
    const { user, profile } = useAuth();
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [activeChatUser, setActiveChatUser] = useState(null); // Used by admin to track who they are chatting with
    const [inbox, setInbox] = useState([]); // Used by admin to see a list of users who messaged
    const [pendingMessages, setPendingMessages] = useState([]); // Messages currently being sent or failed
    const [adminId, setAdminId] = useState(null);

    const isAdmin = profile?.role === 'admin';

    useEffect(() => {
        if (!user) return;

        // Fetch admin ID if current user is not admin
        if (!isAdmin) {
            fetchAdminId();
        }

        // Fetch initial messages and unread count
        fetchMessages();
        fetchUnreadCount();

        // Subscribe to real-time updates
        const channel = supabase
            .channel('messages-realtime')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'messages' 
            }, payload => {
                console.log('Realtime message payload:', payload.eventType, payload.new?.id);
                if (payload.eventType === 'INSERT') {
                    const newMessage = payload.new;
                    
                    // Logic for updating the messages list
                    const isForMe = newMessage.receiver_id === user.id || newMessage.sender_id === user.id;
                    if (isForMe) {
                        // For Admin: Only add if it's from/to the activeChatUser
                        // For User: Always add (since they only chat with admin)
                        const shouldAddToList = !isAdmin || 
                                              (activeChatUser && (newMessage.sender_id === activeChatUser.id || newMessage.receiver_id === activeChatUser.id));
                        
                        if (shouldAddToList) {
                            setMessages(prev => {
                                // Prevent duplicates
                                if (prev.find(m => m.id === newMessage.id)) return prev;
                                return [...prev, newMessage];
                            });

                            // If this message has a temp ID in payload, remove it from pending
                            if (newMessage.payload?._tempId) {
                                console.log('Realtime confirmed message, removing tempId:', newMessage.payload._tempId);
                                setPendingMessages(prev => prev.filter(pm => pm.id !== newMessage.payload._tempId));
                            }
                        }

                        // Update Unread Count if it's for me and from someone else
                        if (newMessage.receiver_id === user.id) {
                            fetchUnreadCount();
                            if (isAdmin) refreshInbox();
                        }
                    }
                } else if (payload.eventType === 'UPDATE') {
                    // Sync is_read and is_pinned status
                    const updatedMessage = payload.new;
                    if (updatedMessage.receiver_id === user.id || updatedMessage.sender_id === user.id) {
                        fetchUnreadCount();
                        setMessages(prev => prev.map(m => m.id === updatedMessage.id ? updatedMessage : m));
                    }
                } else if (payload.eventType === 'DELETE') {
                    console.log('Realtime message deleted:', payload.old?.id);
                    const deletedId = payload.old?.id;
                    if (deletedId) {
                        setMessages(prev => prev.filter(m => m.id !== deletedId));
                    }
                }
            })
            .subscribe((status, err) => {
                console.log('Chat subscription status:', status);
                if (err) console.error('Chat subscription error:', err);
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, activeChatUser]);

    const fetchMessages = async () => {
        if (!user) return;
        setLoading(true);
        try {
            let query = supabase
                .from('messages')
                .select('*')
                .order('created_at', { ascending: true });

            if (isAdmin && activeChatUser) {
                // Admin sees messages between them and the selected user
                query = query.or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${user.id})`);
            } else if (!isAdmin) {
                // User sees messages between them and the admin
                // Note: We'll need the Admin's ID. For now assuming a single admin system.
                query = query.or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
            } else {
                // Admin with no active chat selected (maybe just loading inbox)
                setMessages([]);
                setLoading(false);
                return;
            }

            const { data, error } = await query;
            if (error) throw error;
            setMessages(data || []);
        } catch (error) {
            console.error('Error fetching messages:', error);
        } finally {
            setLoading(false);
        }
    };

    const refreshInbox = async () => {
        if (!isAdmin) return;
        try {
            // Get unique senders who messaged the admin
            const { data, error } = await supabase
                .from('messages')
                .select('sender_id, content, created_at, profiles!messages_sender_id_fkey(full_name, email)')
                .eq('receiver_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Get unread counts per sender
            const { data: unreadData } = await supabase
                .from('messages')
                .select('sender_id')
                .eq('receiver_id', user.id)
                .eq('is_read', false);

            const unreadCounts = {};
            unreadData?.forEach(m => {
                unreadCounts[m.sender_id] = (unreadCounts[m.sender_id] || 0) + 1;
            });

            // De-duplicate inbox entries and keep last message
            const uniqueInbox = [];
            const seen = new Set();
            data?.forEach(item => {
                if (!seen.has(item.sender_id)) {
                    seen.add(item.sender_id);
                    uniqueInbox.push({
                        id: item.sender_id,
                        full_name: item.profiles?.full_name,
                        email: item.profiles?.email,
                        lastMessage: item.content,
                        lastTime: item.created_at,
                        unreadCount: unreadCounts[item.sender_id] || 0
                    });
                }
            });
            setInbox(uniqueInbox);
        } catch (error) {
            console.error('Error refreshing inbox:', error);
        }
    };

    const fetchUnreadCount = async () => {
        if (!user) return;
        try {
            const { count, error } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('receiver_id', user.id)
                .eq('is_read', false);
            
            if (error) throw error;
            setUnreadCount(count || 0);
        } catch (error) {
            console.error('Error fetching unread count:', error);
        }
    };

    const markAsRead = async (senderId) => {
        if (!user) return;
        try {
            const { error } = await supabase
                .from('messages')
                .update({ is_read: true })
                .eq('receiver_id', user.id)
                .eq('sender_id', senderId)
                .eq('is_read', false);

            if (error) throw error;
            
            // Re-fetch count after marking as read
            fetchUnreadCount();
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    };

    const fetchAdminId = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id')
                .eq('role', 'admin')
                .limit(1)
                .single();
            if (error) throw error;
            if (data) setAdminId(data.id);
        } catch (error) {
            console.error('Error fetching admin ID:', error);
        }
    };

    const sendMessage = async (content, specificReceiverId = null, payload = null) => {
        if (!user || (!content.trim() && !payload)) return;

        const receiverId = specificReceiverId || (isAdmin ? activeChatUser?.id : adminId);
        if (!receiverId) {
            console.error('No receiver identified for message');
            return;
        }

        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        const newPendingMessage = {
            id: tempId,
            sender_id: user.id,
            receiver_id: receiverId,
            content: content.trim(),
            payload: payload,
            created_at: now,
            status: 'sending' // 'sending' | 'failed'
        };

        // Add to pending messages immediately for UI feedback
        setPendingMessages(prev => [...prev, newPendingMessage]);

        try {
            const { data, error } = await supabase
                .from('messages')
                .insert([{
                    sender_id: user.id,
                    receiver_id: receiverId,
                    content: content.trim(),
                    payload: { ...payload, _tempId: tempId } // Link with pending UI
                }])
                .select()
                .single();

            if (error) throw error;
            console.log('Chat: Message delivered to server');
            
            // NOTE: We no longer manually add to messages or remove from pending here.
            // The Realtime listener will handle the transition smoothly.
        } catch (error) {
            console.error('Error sending message:', error);
            // Update status to failed
            setPendingMessages(prev => 
                prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
            );
        }
    };

    const retryMessage = async (tempId) => {
        const messageToRetry = pendingMessages.find(m => m.id === tempId);
        if (!messageToRetry) return;

        // Set back to sending status
        setPendingMessages(prev => 
            prev.map(m => m.id === tempId ? { ...m, status: 'sending' } : m)
        );
        try {
            const { data, error } = await supabase
                .from('messages')
                .insert([{
                    sender_id: user.id,
                    receiver_id: messageToRetry.receiver_id,
                    content: messageToRetry.content,
                    payload: { ...messageToRetry.payload, _tempId: tempId } // Re-link
                }])
                .select()
                .single();

            if (error) throw error;
            console.log('Chat: Retry delivered');

            // Transition will be handled by Realtime listener
        } catch (error) {
            console.error('Error retrying message:', error);
            setPendingMessages(prev => 
                prev.map(m => m.id === tempId ? { ...m, status: 'failed' } : m)
            );
        }
    };

    const deletePendingMessage = (tempId) => {
        setPendingMessages(prev => prev.filter(m => m.id !== tempId));
    };

    const unsendMessage = async (messageId) => {
        console.log('Unsending message:', messageId);
        try {
            const { error } = await supabase
                .from('messages')
                .delete()
                .eq('id', messageId)
                .eq('sender_id', user.id);
            if (error) {
                console.error('Supabase delete error:', error);
                throw error;
            }
            console.log('Message unsent successfully');
        } catch (error) {
            console.error('Error unsending message:', error);
            throw error;
        }
    };

    const togglePinMessage = async (messageId, currentPinStatus) => {
        console.log('Toggling pin for message:', messageId, 'current:', currentPinStatus);
        try {
            const { error } = await supabase
                .from('messages')
                .update({ is_pinned: !currentPinStatus })
                .eq('id', messageId);

            if (error) {
                console.error('Supabase update error:', error);
                throw error;
            }
            console.log('Pin toggled successfully');
        } catch (error) {
            console.error('Error toggling pin:', error);
            throw error;
        }
    };

    const clearChat = async (targetUserId) => {
        console.log('Clearing chat with user:', targetUserId);
        try {
            const { error } = await supabase
                .from('messages')
                .delete()
                .or(`and(sender_id.eq.${user.id},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${user.id})`);
            
            if (error) throw error;
            
            // Refresh counts and inbox
            fetchUnreadCount();
            refreshInbox();
            if (activeChatUser?.id === targetUserId) setMessages([]);
            
            console.log('Chat cleared successfully');
        } catch (error) {
            console.error('Error clearing chat:', error);
            throw error;
        }
    };

    const clearAllChats = async () => {
        console.log('Clearing all admin chats');
        try {
            const { error } = await supabase
                .from('messages')
                .delete()
                .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);
            
            if (error) throw error;
            
            // Refresh counts and inbox
            fetchUnreadCount();
            refreshInbox();
            setMessages([]);
            
            console.log('All chats cleared successfully');
        } catch (error) {
            console.error('Error clearing all chats:', error);
            throw error;
        }
    };


    return (
        <ChatContext.Provider value={{
            messages,
            inbox,
            pendingMessages,
            unreadCount,
            activeChatUser,
            setActiveChatUser,
            sendMessage,
            retryMessage,
            deletePendingMessage,
            markAsRead,
            refreshInbox,
            fetchMessages,
            fetchUnreadCount,
            unsendMessage,
            togglePinMessage,
            clearChat,
            clearAllChats
        }}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => useContext(ChatContext);
