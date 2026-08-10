// lib/cache/cacheService.ts
import fs from "fs/promises";
import path from "path";

// Contrato único para cualquier driver de almacenamiento
export interface CacheDriver {
  get<T = any>(key: string): Promise<T | null>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * IMPLEMENTACIÓN 1: FileSystem Local (Cero costo, desarrollo local)
 */
class FileSystemCacheAdapter implements CacheDriver {
  private cacheDir = path.join(process.cwd(), ".cache", "snapshots");

  private getFilePath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(this.cacheDir, `${safeKey}.json`);
  }

  async get<T = any>(key: string): Promise<T | null> {
    try {
      const filePath = this.getFilePath(key);
      const rawData = await fs.readFile(filePath, "utf-8");
      return JSON.parse(rawData) as T;
    } catch {
      return null; // Cache Miss o archivo no encontrado
    }
  }

  async set(key: string, value: any): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      const filePath = this.getFilePath(key);
      await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
    } catch (error) {
      console.error("[CacheAdapter:FileSystem] Error al escribir en disco:", error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
    } catch {
      // Ignora si no existía el archivo
    }
  }
}

/**
 * IMPLEMENTACIÓN 2: Redis Adapter (Para escalado en producción)
 */
class RedisCacheAdapter implements CacheDriver {
  // Nota: Aquí se conectaría con ioredis o @upstash/redis cuando lo requieras
  async get<T = any>(key: string): Promise<T | null> {
    console.log(`[Redis] Mock Get Key: ${key}`);
    return null;
  }

  async set(key: string, value: any, ttlSeconds: number = 86400): Promise<void> {
    console.log(`[Redis] Mock Set Key: ${key} con TTL: ${ttlSeconds}s`);
  }

  async delete(key: string): Promise<void> {
    console.log(`[Redis] Mock Delete Key: ${key}`);
  }
}

// Factoría que conmuta el driver según la variable de entorno
const selectedDriver = process.env.CACHE_DRIVER === "redis" 
  ? new RedisCacheAdapter() 
  : new FileSystemCacheAdapter();

export const cacheService: CacheDriver = selectedDriver;