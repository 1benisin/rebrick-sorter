import { fetchRelatedParts } from '../../dataManagers/partBasics';

// Path: /api/partRelated
export default async (req, res) => {
  const { partId } = req.query;
  const [error, parts] = await fetchRelatedParts(partId);

  error && res.status(500).json(error);

  res.status(200).json(parts);
};
