export class StayManager {
    constructor() {
        this.stays = [];
        this.listeners = new Set();
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify() {
        this.listeners.forEach(listener => listener(this.stays));
    }

    async fetchStays() {
        try {
            const response = await fetch('/api/stays');
            this.stays = await response.json();
            this.notify();
        } catch (error) {
            ErrorHandler.showError('Failed to fetch stays');
        }
    }
}
