import {Server, Socket} from 'socket.io';
import {createServer, Server as HttpServer} from 'http';
import {Booking, ClientToServerEvents, Message, MessageRequest, ServerToClientEvents} from './types/chat.types';
import axios from 'axios';

export class ChatServer {
    private io: Server<ClientToServerEvents, ServerToClientEvents>;
    private readonly API_URL = process.env.API_URL || 'http://localhost:3000';
    private connectedUsers: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

    constructor(httpServer: HttpServer = createServer()) {
        this.io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
            cors: {
                origin: process.env.CLIENT_URL || 'http://localhost:5173',
                credentials: true
            },
            path: '/socket.io'
        });

        this.io.on('connection', this.handleConnection);

    }

    private handleConnection = async (socket: Socket) => {
        const userId = socket.handshake.query.userId as string;
        const token = socket.handshake.auth.token as string;

        // Track connected user
        if (!this.connectedUsers.has(userId)) {
            this.connectedUsers.set(userId, new Set());
        }
        this.connectedUsers.get(userId)?.add(socket.id);

        console.log(`Client connected: ${socket.id}, User: ${userId}`);
        console.log(`Connected users: ${JSON.stringify(Array.from(this.connectedUsers.keys()))}`);

        try {
            // Initial fetch of relevant bookings
            const response = await axios.get<Booking[]>(
                `${this.API_URL}/bookings/findByUserGuestOrHost/${userId}`,
                {
                    headers: { Authorization: `Bearer ${token}` }
                }
            );

            // Join conversation rooms
            response.data.forEach(booking => {
                if (booking.conversation) {
                    socket.join(booking.conversation.id);
                    console.log(`User ${userId} joined room ${booking.conversation.id}`);
                }
            });

            socket.emit('bookingsUpdated', response.data);

        } catch (error: any) {
            if (error.response?.status === 401) {
                socket.emit('tokenExpired');
            }
            socket.disconnect();
            return;
        }

        socket.on('sendMessage', async (message: MessageRequest, callback ) => {
            try {
                await axios.post(
                    `${this.API_URL}/users/chat/message`,
                    message,
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );

                const finalMessage: MessageRequest = {
                    from: message.from,
                    to: message.to,
                    content: message.content,
                    timestamp: message.timestamp,
                    conversationId: message.conversationId
                };

                this.io.to(message.conversationId).emit('messageReceived', finalMessage);

                callback({ success: true });
            } catch (error: any) {
                if (error.response?.status === 401) {
                    socket.emit('tokenExpired');
                    socket.disconnect();
                } else {
                    socket.emit('messageError', {
                        error: 'Failed to send message',
                        originalMessage: message
                    });
                }
            }
        });

        socket.on('openChat', async (conversationId: string) => {
            try {
                // Mark messages as read in backend
                await axios.put(
                    `${this.API_URL}/bookings/conversation/${conversationId}/read`,
                    {},
                    {
                        headers: { Authorization: `Bearer ${token}` }
                    }
                );

                // Notify other users in the conversation that messages were read
                socket.to(conversationId).emit('messagesRead', {
                    conversationId,
                    userId
                });

            } catch (error) {
                console.error('Failed to mark conversation as read:', error);
            }
        });

        socket.on('bookingCreated', async (booking: Booking) => {
            // Get the relevant users for this booking
            const guestId = booking.guest.id;
            const ownerId = booking.property.owner.id;

            // For each connected user that should be notified
            for (const userId of [guestId, ownerId]) {
                const userSockets = this.connectedUsers.get(userId);
                if (userSockets) {
                    try {
                        // Fetch fresh bookings for this user
                        const response = await axios.get<Booking[]>(
                            `${this.API_URL}/bookings/findByUserGuestOrHost/${userId}`,
                            {
                                headers: { Authorization: `Bearer ${token}` }
                            }
                        );

                        // Notify all their connected sockets
                        userSockets.forEach(socketId => {
                            const socket = this.io.sockets.sockets.get(socketId);
                            if (socket) {
                                // Join the new conversation room
                                if (booking.conversation) {
                                    socket.join(booking.conversation.id);
                                }
                                // Send them their updated bookings
                                socket.emit('bookingsUpdated', response.data);
                            }
                        });
                    } catch (error) {
                        console.error(`Failed to update bookings for user ${userId}:`, error);
                    }
                }
            }
        });

        socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
            socket.to(data.conversationId).emit('typing', {
                userId,
                isTyping: data.isTyping
            });
        });

        socket.on('joinRoom', (conversationId: string) => {
            socket.join(conversationId);
            socket.to(conversationId).emit('userJoined', userId);
            console.log(`User ${userId} joined room ${conversationId}`)
            console.log(`User ${userId} joined room ${conversationId}`);
        });

        socket.on('leaveRoom', (conversationId: string) => {
            socket.leave(conversationId);
            socket.to(conversationId).emit('userLeft', userId);
            console.log(`User ${userId} left room ${conversationId}`);
        });

        socket.on('disconnect', () => {
            // Remove from tracked connections
            this.connectedUsers.get(userId)?.delete(socket.id);
            if (this.connectedUsers.get(userId)?.size === 0) {
                this.connectedUsers.delete(userId);
            }
            console.log(`Client disconnected: ${socket.id}, User: ${userId}`);
        });
    };

    public start(port: number): void {
        this.io.listen(port);
        console.log(`Chat server listening on port ${port}`);
    }

    public stop(): void {
        this.io.close();
        console.log('Chat server stopped');
    }
}

const httpServer = createServer();
const chatServer = new ChatServer(httpServer);

const port = process.env.PORT || '3001';
chatServer.start(Number.parseInt(port));


// Handle process termination signals
process.on('SIGINT', () => {
    console.log('Received SIGINT. Shutting down server...');
    chatServer.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Shutting down server...');
    chatServer.stop();
    process.exit(0);
});