"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, UserResponse } from "./api";
import { generateKeyPair, generateSalt, encryptPrivateKey, decryptPrivateKey } from "./crypto";

const E2EE_PRIVATE_KEY_STORAGE = "krypts_e2ee_priv";

interface AuthContextType {
  user: UserResponse | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Generate a fresh E2EE keypair, encrypt the private key with the user's
 * password, and cache the plaintext (decrypted) private key locally for
 * this session. Used both at signup and when lazily provisioning an
 * existing account that predates end-to-end encryption. */
async function provisionKeys(password: string) {
  const keyPair = await generateKeyPair();
  const salt = generateSalt();
  const encryptedPrivateKey = await encryptPrivateKey(keyPair.privateKeyB64, password, salt);
  localStorage.setItem(E2EE_PRIVATE_KEY_STORAGE, keyPair.privateKeyB64);
  return { publicKey: keyPair.publicKeyB64, encryptedPrivateKey, salt };
}

/** After login, unlock (or lazily create) this account's E2EE keys and
 * cache the decrypted private key in localStorage for this session. */
async function unlockOrProvisionKeys(password: string) {
  try {
    const bundle = await api.auth.getKeys();
    if (bundle.has_keys && bundle.encrypted_private_key && bundle.key_salt) {
      const privateKeyB64 = await decryptPrivateKey(bundle.encrypted_private_key, password, bundle.key_salt);
      localStorage.setItem(E2EE_PRIVATE_KEY_STORAGE, privateKeyB64);
      return;
    }
  } catch {
    // Fall through to provisioning — treat any failure as "no keys yet"
  }

  // Existing account created before E2EE existed — provision now.
  const { publicKey, encryptedPrivateKey, salt } = await provisionKeys(password);
  await api.auth.setKeys(publicKey, encryptedPrivateKey, salt);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on mount — show cached user instantly, validate in background
  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setIsLoading(false);
      return;
    }

    // Show cached user immediately to avoid loading spinner
    try {
      const cached = localStorage.getItem("cached_user");
      if (cached) {
        setUser(JSON.parse(cached));
        setIsLoading(false);
      }
    } catch { /* ignore corrupt cache */ }

    // Validate token in background
    api.auth
      .me()
      .then((u) => {
        setUser(u);
        localStorage.setItem("cached_user", JSON.stringify(u));
      })
      .catch((err: Error & { status?: number }) => {
        // Only a real auth failure (401 = bad/expired token) should log the
        // user out. Transient errors — rate limiting (429), a momentary
        // network blip, a backend restart — must not nuke a valid session;
        // the cached user stays logged in and we just retry next time.
        if (err.status === 401) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("cached_user");
          setUser(null);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const resp = await api.auth.login(email, password);
    localStorage.setItem("access_token", resp.access_token);
    const me = await api.auth.me();
    localStorage.setItem("cached_user", JSON.stringify(me));
    setUser(me);

    // Password is only available here, in memory, for this brief window —
    // use it now to unlock (or lazily provision) this account's E2EE keys.
    // Deliberately NOT awaited: the PBKDF2 derivation is intentionally slow
    // (hundreds of ms), and login should feel instant. It finishes in the
    // background; E2EE features just wait a moment longer to become usable.
    unlockOrProvisionKeys(password).catch(() => {
      // Non-fatal: E2EE features will be unavailable this session, but
      // regular login must not fail because of a key-provisioning hiccup.
    });
  }, []);

  const signup = useCallback(
    async (email: string, password: string, fullName?: string) => {
      const { publicKey, encryptedPrivateKey, salt } = await provisionKeys(password);
      const resp = await api.auth.signup(email, password, fullName, {
        public_key: publicKey,
        encrypted_private_key: encryptedPrivateKey,
        key_salt: salt,
      });
      localStorage.setItem("access_token", resp.access_token);
      const me = await api.auth.me();
      localStorage.setItem("cached_user", JSON.stringify(me));
      setUser(me);
    },
    []
  );

  const logout = useCallback(() => {
    api.auth.logout().catch(() => {});
    localStorage.removeItem("access_token");
    localStorage.removeItem("cached_user");
    localStorage.removeItem(E2EE_PRIVATE_KEY_STORAGE);
    if (typeof document !== 'undefined') document.body.style.pointerEvents = '';
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
