import { describe, it, expect, vi, beforeEach } from "vitest";
import { useGitStore } from "./useGitStore";
import axios from "axios";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

describe("useGitStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useGitStore.setState({
      history: [],
      latestCommit: null,
      isLoading: false,
      diff: null,
      isDiffLoading: false,
      showDiff: false,
    });
    vi.clearAllMocks();
  });

  describe("fetchHistory", () => {
    it("fetches and stores git history", async () => {
      const mockHistory = [
        {
          hexsha: "abc123",
          author_name: "Test Author",
          author_email: "test@example.com",
          date: "2024-01-01T00:00:00Z",
          message: "Test commit",
        },
      ];
      mockedAxios.get.mockResolvedValueOnce({ data: mockHistory });

      await useGitStore.getState().fetchHistory("test.md");

      expect(mockedAxios.get).toHaveBeenCalledWith(
        "/api/git/history?path=test.md",
      );
      expect(useGitStore.getState().history).toEqual(mockHistory);
      expect(useGitStore.getState().isLoading).toBe(false);
    });

    it("handles fetch error gracefully", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Network error"));

      await useGitStore.getState().fetchHistory("test.md");

      expect(useGitStore.getState().history).toEqual([]);
      expect(useGitStore.getState().isLoading).toBe(false);
    });
  });

  describe("fetchStatus", () => {
    it("fetches and stores latest commit", async () => {
      const mockCommit = {
        hexsha: "abc123",
        author_name: "Test Author",
        author_email: "test@example.com",
        date: "2024-01-01T00:00:00Z",
        message: "Test commit",
      };
      mockedAxios.get.mockResolvedValueOnce({ data: mockCommit });

      await useGitStore.getState().fetchStatus("test.md");

      expect(mockedAxios.get).toHaveBeenCalledWith(
        "/api/git/status?path=test.md",
      );
      expect(useGitStore.getState().latestCommit).toEqual(mockCommit);
    });

    it("handles fetch error by setting latestCommit to null", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Not found"));

      await useGitStore.getState().fetchStatus("test.md");

      expect(useGitStore.getState().latestCommit).toBeNull();
    });
  });

  describe("fetchDiff", () => {
    it("fetches and stores diff", async () => {
      const mockDiff = {
        commit_hexsha: "abc123",
        commit_message: "Test commit",
        commit_author: "Test Author",
        commit_date: "2024-01-01T00:00:00Z",
        file_path: "test.md",
        hunks: [],
        raw_diff: "",
      };
      mockedAxios.get.mockResolvedValueOnce({ data: mockDiff });

      await useGitStore.getState().fetchDiff("test.md", "abc123");

      expect(mockedAxios.get).toHaveBeenCalledWith(
        "/api/git/diff?path=test.md&commit=abc123",
      );
      expect(useGitStore.getState().diff).toEqual(mockDiff);
      expect(useGitStore.getState().showDiff).toBe(true);
      expect(useGitStore.getState().isDiffLoading).toBe(false);
    });

    it("handles fetch error by setting diff to null", async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error("Not found"));

      await useGitStore.getState().fetchDiff("test.md", "abc123");

      expect(useGitStore.getState().diff).toBeNull();
      expect(useGitStore.getState().isDiffLoading).toBe(false);
    });
  });

  describe("closeDiff", () => {
    it("closes diff modal and clears diff", () => {
      useGitStore.setState({
        showDiff: true,
        diff: {
          commit_hexsha: "abc123",
          commit_message: "Test",
          commit_author: "Author",
          commit_date: "2024-01-01",
          file_path: "test.md",
          hunks: [],
          raw_diff: "",
        },
      });

      useGitStore.getState().closeDiff();

      expect(useGitStore.getState().showDiff).toBe(false);
      expect(useGitStore.getState().diff).toBeNull();
    });
  });
});
