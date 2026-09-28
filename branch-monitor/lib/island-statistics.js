// Statistics stay in the authenticated database, never in public source/assets.
export async function getIslandStatistics(supabase) {
  const { data, error } = await supabase.from('island_statistics').select('statistics').order('id');
  return { records: (data || []).map(row => row.statistics), error };
}
