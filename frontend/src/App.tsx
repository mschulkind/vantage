import { ViewerPage } from "./pages/ViewerPage";
import { HistoryPage } from "./pages/HistoryPage";
import { RecentsPage } from "./pages/RecentsPage";
import { Routes, Route } from "react-router-dom";

function App() {
  return (
    <Routes>
      <Route path="/history/*" element={<HistoryPage />} />
      <Route path="/recent/*" element={<RecentsPage />} />
      <Route path="/*" element={<ViewerPage />} />
    </Routes>
  );
}

export default App;
