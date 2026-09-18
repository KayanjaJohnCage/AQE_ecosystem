export type StoredUser = {
  id?: string;
  email?: string;
  role?: string;
  display_name?: string;
  displayName?: string;
};

export type StoredSession = {
  access_token?: string;
  refresh_token?: string;
  token?: string;
};

export function readStoredSession() {
  try {
    const session = JSON.parse(localStorage.getItem("aqe-session") ?? "{}");
    const user = JSON.parse(localStorage.getItem("aqe-user") ?? "{}");
    return {
      session: session as StoredSession,
      user: user as StoredUser,
    };
  } catch {
    return { session: {} as StoredSession, user: {} as StoredUser };
  }
}

export function persistStoredSession(payload: {
  session?: StoredSession;
  user?: StoredUser;
}) {
  if (payload.session) {
    localStorage.setItem("aqe-session", JSON.stringify(payload.session));
  }
  if (payload.user) {
    localStorage.setItem("aqe-user", JSON.stringify(payload.user));
  }
}
