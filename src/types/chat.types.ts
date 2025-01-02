export interface ServerToClientEvents {
    messageReceived: (message: Message) => void;
    userJoined: (userId: string) => void;
    userLeft: (userId: string) => void;
    typing: (data: { userId: string; isTyping: boolean }) => void;
    tokenExpired: () => void;
    messageError: (error: { error: string; originalMessage: MessageRequest }) => void;
    bookingsUpdated: (bookings: Booking[]) => void;
    messagesRead: (data: { conversationId: string; userId: string }) => void;
}

export interface ClientToServerEvents {
    sendMessage: (message: MessageRequest) => void;
    joinRoom: (conversationId: string) => void;
    leaveRoom: (conversationId: string) => void;
    typing: (data: { conversationId: string; isTyping: boolean }) => void;
    openChat: (conversationId: string) => void;
    bookingCreated: (booking: Booking) => void;
}

export interface Message {
    from: string;      // User ID of sender
    to: string;        // User ID of recipient
    content: string
    timestamp: Date;
    read: boolean;

}

export interface MessageRequest {
    conversationId: string;
    from: string;      // User ID of sender
    to: string;        // User ID of recipient
    content: string
    timestamp: Date;
}

export interface Booking {
    id: string;
    property: IProperty;
    guest: IUser;
    conversation: Conversation;
}

export interface Conversation {
    id: string;
    active: boolean;      // Whether the conversation is active
    messages: Message[];  // Array of messages in the conversation
}

export enum UserRole {
    USER = 'USER',
    MODERATOR = 'MODERATOR',
    ADMIN = 'ADMIN',
    TEST = 'TEST'
}

export interface IUser {
    id: string;
    firstName: string;
    lastName: string;
    profilePicturePath?: string;
}


export interface IProperty {
    id: string;
    name: string;
    owner: IUser;
}

