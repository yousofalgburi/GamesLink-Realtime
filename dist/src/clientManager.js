const connectedClients = new Map();
export const addClient = (ws, userId, roomId) => {
    connectedClients.set(ws, { userId, roomId });
};
export const removeClient = (ws) => {
    const user = connectedClients.get(ws);
    connectedClients.delete(ws);
    return user?.userId;
};
export const getClient = (ws) => {
    return connectedClients.get(ws);
};
