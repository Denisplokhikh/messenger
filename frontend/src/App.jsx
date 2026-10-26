import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import Toaster from "./components/Toaster";
import { Button, FullScreenMessage, Spinner } from "./components/ui";
import LoginPage from "./pages/LoginPage";
import MessengerPage from "./pages/MessengerPage";
import NotFoundPage from "./pages/NotFoundPage";
import ProfilePage from "./pages/ProfilePage";
import { useAuthStore } from "./store/auth";
import { useChatStore } from "./store/chats";

// Пускает дальше только с токеном и загруженным профилем текущего пользователя
function RequireAuth() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const loadMe = useAuthStore((s) => s.loadMe);
  const logout = useAuthStore((s) => s.logout);
  const location = useLocation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token || user || failed) return;
    // Список чатов не зависит от профиля, поэтому грузим его параллельно с /users/me.
    // Иначе первый экран ждал бы два круга по сети подряд
    useChatStore.getState().loadChats().catch(() => {});
    loadMe().catch(() => setFailed(true));
  }, [token, user, failed, loadMe]);

  if (!token) return <Navigate to="/login" replace state={{ from: location }} />;

  if (!user) {
    return (
      <FullScreenMessage>
        {failed ? (
          <>
            <p className="text-sm text-zinc-500">Не удалось подключиться к серверу.</p>
            <div className="flex gap-2">
              <Button onClick={() => setFailed(false)}>Повторить</Button>
              <Button variant="secondary" onClick={logout}>
                Выйти
              </Button>
            </div>
          </>
        ) : (
          <Spinner />
        )}
      </FullScreenMessage>
    );
  }

  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<MessengerPage />}>
            <Route index element={null} />
            <Route path="chat/:chatId" element={null} />
          </Route>
          <Route path="profile" element={<ProfilePage />} />
          <Route path="profile/:userId" element={<ProfilePage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
