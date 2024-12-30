import {Server, Socket} from 'socket.io';
import {createServer} from 'http';
import axios from 'axios';

interface ChatMessage {
    conversationId: string;
    content: string;
    from: string;
    to: string;
    timestamp: Date;
}

interface ServerToClientEvents {
    messageReceived: (message: ChatMessage) => void;
    userJoined: (userId: string) => void;
    userLeft: (userId: string) => void;
    typing: (data: { userId: string; isTyping: boolean }) => void;
}

interface ClientToServerEvents {
    joinRoom: (conversationId: string) => void;
    leaveRoom: (conversationId: string) => void;
    sendMessage: (message: ChatMessage) => void;
    typing: (data: { conversationId: string; isTyping: boolean }) => void;
}

export class ChatServer {
    private io: Server<ClientToServerEvents, ServerToClientEvents>;
    private readonly NAMESPACE = '/booking-chat';

    constructor(httpServer = createServer()) {
        this.io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
            cors: {
                origin: process.env.CLIENT_URL || 'http://localhost:3000',
                methods: ['GET', 'POST'],
                credentials: true
            },
            path: '/socket.io'
        });

        const bookingNamespace = this.io.of(this.NAMESPACE);
        bookingNamespace.use(this.authenticateConnection);
        bookingNamespace.on('connection', this.handleConnection);
    }

    private authenticateConnection = async (
        socket: Socket,
        next: (err?: Error) => void
    ) => {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication token missing'));
        }

        // Store token in socket data for later use with backend calls
        socket.data.token = token;
        next();
    };

    private async saveMessage(message: ChatMessage, token: string): Promise<void> {
        try {
            await axios.post(`${process.env.API_URL}/message`, message, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.error('Error saving message:', error);
            throw error;
        }
    }

    private handleConnection = (
        socket: Socket<ClientToServerEvents, ServerToClientEvents>
    ) => {
        console.log(`Client connected: ${socket.id}`);

        socket.on('joinRoom', (conversationId: string) => {
            socket.join(conversationId);
            socket.to(conversationId).emit('userJoined', socket.data.user?.id);
            console.log(`User joined room: ${conversationId}`);
        });

        socket.on('leaveRoom', (conversationId: string) => {
            socket.leave(conversationId);
            socket.to(conversationId).emit('userLeft', socket.data.user?.id);
            console.log(`User left room: ${conversationId}`);
        });

        socket.on('sendMessage', async (message: ChatMessage) => {
            try {
                await this.saveMessage(message, socket.data.token);

                this.io
                    .of(this.NAMESPACE)
                    .to(message.conversationId)
                    .emit('messageReceived', message);

                console.log(`Message sent in conversation: ${message.conversationId}`);
            } catch (error) {
                console.error('Error handling message:', error);
            }
        });

        socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
            socket
                .to(data.conversationId)
                .emit('typing', {userId: socket.data.user?.id, isTyping: data.isTyping});
        });

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
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