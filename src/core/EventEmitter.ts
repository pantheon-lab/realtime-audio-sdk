import type { EventListener } from '@/types';

/**
 * Simple EventEmitter implementation
 */
export class EventEmitter<Events> {
  private listeners: Map<keyof Events, Set<EventListener>> = new Map();

  /**
   * Add an event listener
   */
  on<K extends keyof Events>(event: K, listener: Events[K] extends (...args: any[]) => any ? Events[K] : never): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as EventListener);
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof Events>(event: K, listener: Events[K] extends (...args: any[]) => any ? Events[K] : never): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener as EventListener);
    }
  }

  /**
   * Add a one-time event listener
   */
  once<K extends keyof Events>(event: K, listener: Events[K] extends (...args: any[]) => any ? Events[K] : never): void {
    const onceWrapper = ((data: any) => {
      (listener as any)(data);
      this.off(event, onceWrapper as any);
    }) as any;
    this.on(event, onceWrapper);
  }

  /**
   * Emit an event
   */
  protected emit<K extends keyof Events>(
    event: K,
    data: Events[K] extends (...args: any[]) => any ? Parameters<Events[K]>[0] : never
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for "${String(event)}":`, error);
        }
      });
    }
  }

  /**
   * Remove all listeners for an event or all events
   */
  removeAllListeners<K extends keyof Events>(event?: K): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get listener count for an event
   */
  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
