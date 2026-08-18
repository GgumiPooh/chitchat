"use client";

import type { Emoticon } from "@/entities/emoticon";
import { A_MINUTE, type EmoticonItemId } from "@/shared/lib";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  addEmoticonFavoriteRequest,
  fetchUserEmoticonFavorites,
  removeEmoticonFavoriteRequest,
} from "../api/emoticon-favorites";

export const USER_EMOTICON_FAVORITES_QUERY_KEY = ["user-emoticon-favorites"] as const;

export function useEmoticonFavorites() {
  const queryClient = useQueryClient();

  const { data: favorites = [] } = useQuery<Emoticon[]>({
    queryKey: USER_EMOTICON_FAVORITES_QUERY_KEY,
    queryFn: fetchUserEmoticonFavorites,
    staleTime: 5 * A_MINUTE,
  });

  const favoriteIds = useMemo(() => new Set(favorites.map((item) => item.id)), [favorites]);

  const addMutation = useMutation({
    mutationFn: (emoticon: Emoticon) => addEmoticonFavoriteRequest(emoticon.id),
    onMutate: async (emoticon: Emoticon) => {
      await queryClient.cancelQueries({ queryKey: USER_EMOTICON_FAVORITES_QUERY_KEY });
      const previous =
        queryClient.getQueryData<Emoticon[]>(USER_EMOTICON_FAVORITES_QUERY_KEY) ?? [];
      queryClient.setQueryData<Emoticon[]>(USER_EMOTICON_FAVORITES_QUERY_KEY, [
        emoticon,
        ...previous.filter((item) => item.id !== emoticon.id),
      ]);
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(USER_EMOTICON_FAVORITES_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: USER_EMOTICON_FAVORITES_QUERY_KEY });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: EmoticonItemId) => removeEmoticonFavoriteRequest(itemId),
    onMutate: async (itemId: EmoticonItemId) => {
      await queryClient.cancelQueries({ queryKey: USER_EMOTICON_FAVORITES_QUERY_KEY });
      const previous =
        queryClient.getQueryData<Emoticon[]>(USER_EMOTICON_FAVORITES_QUERY_KEY) ?? [];
      queryClient.setQueryData<Emoticon[]>(
        USER_EMOTICON_FAVORITES_QUERY_KEY,
        previous.filter((item) => item.id !== itemId),
      );
      return { previous };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(USER_EMOTICON_FAVORITES_QUERY_KEY, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: USER_EMOTICON_FAVORITES_QUERY_KEY });
    },
  });

  const isFavorite = useCallback(
    (itemId: EmoticonItemId) => favoriteIds.has(itemId),
    [favoriteIds],
  );

  const toggleFavorite = useCallback(
    (emoticon: Emoticon) => {
      if (favoriteIds.has(emoticon.id)) {
        removeMutation.mutate(emoticon.id);
      } else {
        addMutation.mutate(emoticon);
      }
    },
    [addMutation, favoriteIds, removeMutation],
  );

  return {
    favorites,
    isFavorite,
    toggleFavorite,
  };
}
