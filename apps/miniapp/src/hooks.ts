/**
 * Хуки данных поверх TanStack Query.
 *
 * Кэш здесь важен не ради скорости, а ради денег: каждый повторный поиск
 * списывает бесплатную квоту пользователя. Поэтому поиск — мутация с явным
 * действием пользователя, а не автоматический запрос на каждый рендер.
 */

import {
	useMutation,
	useQuery,
	useQueryClient,
	type UseMutationResult,
} from "@tanstack/react-query"

import { api, ApiRequestError } from "./api"
import { hapticResult, openInvoice } from "./telegram"

export const queryKeys = {
	profile: ["profile"] as const,
	favorites: ["favorites"] as const,
	watches: ["watches"] as const,
}

export function useProfile() {
	return useQuery({
		queryKey: queryKeys.profile,
		queryFn: api.profile,
		staleTime: 60_000,
	})
}

export function useSearch() {
	return useMutation({
		mutationFn: api.search,
		onSuccess: () => hapticResult("success"),
		onError: () => hapticResult("error"),
	})
}

export function useExplore() {
	return useMutation({ mutationFn: api.explore })
}

export function useCalendar() {
	return useMutation({ mutationFn: api.calendar })
}

export function useFavorites() {
	return useQuery({
		queryKey: queryKeys.favorites,
		queryFn: api.favorites,
		staleTime: 30_000,
	})
}

export function useToggleFavorite() {
	const client = useQueryClient()

	return useMutation({
		mutationFn: (input: {
			origin: string
			destination: string
			existingId?: number
		}) =>
			input.existingId
				? api.removeFavorite(input.existingId)
				: api.addFavorite({
						origin: input.origin,
						destination: input.destination,
					}),
		onSuccess: (data) => {
			client.setQueryData(queryKeys.favorites, data)
			hapticResult("success")
		},
	})
}

export function useWatches() {
	return useQuery({
		queryKey: queryKeys.watches,
		queryFn: api.watches,
		staleTime: 30_000,
	})
}

export function useAddWatch() {
	const client = useQueryClient()

	return useMutation({
		mutationFn: api.addWatch,
		onSuccess: (data) => {
			client.setQueryData(queryKeys.watches, data)
			hapticResult("success")
		},
		onError: () => hapticResult("error"),
	})
}

export function useRemoveWatch() {
	const client = useQueryClient()

	return useMutation({
		mutationFn: api.removeWatch,
		onSuccess: (data) => client.setQueryData(queryKeys.watches, data),
	})
}

/**
 * Покупка Plus.
 *
 * После успешной оплаты доступ выдаёт вебхук бота, а не этот код. Здесь только
 * инвалидация профиля — и то с задержкой: successful_payment может доехать на
 * мгновение позже закрытия окна оплаты.
 */
export function useBuyPlus(): UseMutationResult<
	"paid" | "cancelled" | "failed" | "pending",
	ApiRequestError,
	void
> {
	const client = useQueryClient()

	return useMutation<
		"paid" | "cancelled" | "failed" | "pending",
		ApiRequestError,
		void
	>({
		mutationFn: async () => {
			const { invoiceLink } = await api.invoice()
			return openInvoice(invoiceLink)
		},
		onSuccess: async (status) => {
			if (status !== "paid") return

			hapticResult("success")
			await new Promise((resolve) => setTimeout(resolve, 1200))
			await client.invalidateQueries({ queryKey: queryKeys.profile })
		},
	})
}
