import { useQuery, useQueryClient } from '@tanstack/react-query'
import { readMintLog } from '@/components/mint/mint-log'

const QUERY_KEY = ['mint-log']

export function useMintLog() {
  return useQuery({ queryKey: QUERY_KEY, queryFn: readMintLog })
}

export function useInvalidateMintLog() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: QUERY_KEY })
}
