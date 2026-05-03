"use client";

import { createContext, useContext, type ReactNode } from "react";

type Role = "admin" | "viewer" | string;

type RoleCtx = {
  role: Role;
  canWrite: boolean;
};

const Ctx = createContext<RoleCtx>({ role: "admin", canWrite: true });

export function RoleProvider({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  return (
    <Ctx.Provider value={{ role, canWrite: role === "admin" }}>
      {children}
    </Ctx.Provider>
  );
}

/** Returns true when the current dashboard user can perform write actions. */
export function useCanWrite(): boolean {
  return useContext(Ctx).canWrite;
}

/** Full role context — useful when the UI changes for viewers beyond hiding buttons. */
export function useRole(): RoleCtx {
  return useContext(Ctx);
}
