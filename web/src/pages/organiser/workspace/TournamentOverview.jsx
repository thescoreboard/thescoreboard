import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getWorkspace } from "../../../api/client";
import PageLoader from "../../../components/shared/PageLoader";

// Every tournament is single-sport (one event), so this route just forwards
// to that event's workspace.
export default function TournamentOverview() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    getWorkspace(tournamentId)
      .then(({ events }) => {
        if (events?.length) navigate(`/organiser/tournament/${tournamentId}/event/${events[0].event_id}`, { replace: true });
        else navigate("/organiser", { replace: true });
      })
      .catch(() => navigate("/organiser", { replace: true }));
  }, [tournamentId, navigate]);

  return <PageLoader />;
}
