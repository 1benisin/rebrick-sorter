import { fetchFilteredParts } from '../../dataManagers/partBasics';

export default async (req, res) => {
  const { filterText } = req.query;
  const [error, parts] = await fetchFilteredParts(filterText);

  error && res.status(500).json(error);

  res.status(200).json(parts);
};
