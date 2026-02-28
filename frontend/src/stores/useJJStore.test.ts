import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { useJJStore } from "./useJJStore";

vi.mock("axios");
vi.mock("./useRepoStore", () => ({
  useRepoStore: {
    getState: () => ({ currentRepo: null, isMultiRepo: false }),
  },
}));

const mockedAxios = vi.mocked(axios, true);

describe("useJJStore", () => {
  beforeEach(() => {
    useJJStore.setState({
      info: null,
      revisions: [],
      evolog: [],
      diff: null,
      isLoading: false,
      isDiffLoading: false,
      showDiff: false,
      showEvolog: false,
    });
    vi.clearAllMocks();
  });

  it("fetchInfo sets info on success", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { is_jj: true, working_copy_change_id: "abc123" },
    });
    await useJJStore.getState().fetchInfo();
    expect(useJJStore.getState().info).toEqual({
      is_jj: true,
      working_copy_change_id: "abc123",
    });
  });

  it("fetchInfo sets is_jj false on error", async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error("not found"));
    await useJJStore.getState().fetchInfo();
    expect(useJJStore.getState().info?.is_jj).toBe(false);
  });

  it("fetchLog populates revisions", async () => {
    const revs = [
      {
        change_id: "abc",
        commit_id: "def123",
        description: "test",
        author: "me",
        timestamp: "2024-01-01T00:00:00Z",
        bookmarks: [],
        is_working_copy: false,
      },
    ];
    mockedAxios.get.mockResolvedValueOnce({ data: revs });
    await useJJStore.getState().fetchLog("README.md");
    expect(useJJStore.getState().revisions).toEqual(revs);
    expect(useJJStore.getState().isLoading).toBe(false);
  });

  it("fetchDiff sets diff and shows modal", async () => {
    const diff = {
      commit_hexsha: "abc",
      commit_message: "test",
      commit_author: "me",
      commit_date: "2024-01-01",
      file_path: "README.md",
      hunks: [],
      raw_diff: "",
    };
    mockedAxios.get.mockResolvedValueOnce({ data: diff });
    await useJJStore.getState().fetchDiff("abc", "README.md");
    expect(useJJStore.getState().diff).toEqual(diff);
    expect(useJJStore.getState().showDiff).toBe(true);
  });

  it("reset clears all state", () => {
    useJJStore.setState({
      info: { is_jj: true, working_copy_change_id: "x" },
      revisions: [
        {
          change_id: "a",
          commit_id: "b",
          description: "",
          author: "",
          timestamp: "",
          bookmarks: [],
          is_working_copy: false,
        },
      ],
      showDiff: true,
    });
    useJJStore.getState().reset();
    expect(useJJStore.getState().info).toBeNull();
    expect(useJJStore.getState().revisions).toEqual([]);
    expect(useJJStore.getState().showDiff).toBe(false);
  });
});
