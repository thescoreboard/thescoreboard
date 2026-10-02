"""
Base sport interface.

Every sport module must implement a class that inherits from BaseSport.
This ensures consistent behavior across the app regardless of sport.
"""
from abc import ABC, abstractmethod
from typing import Optional


class BaseSport(ABC):
    """
    Abstract base class for all sport scoring engines.

    Each sport module (table_tennis/, badminton/, etc.) provides a concrete
    subclass that implements these methods. The rest of the app calls these
    methods without knowing which sport is being played.
    """

    @abstractmethod
    def get_default_config(self) -> dict:
        """
        Return the default sport_config JSON for this sport.
        This is stored in Event.sport_config when the organizer doesn't customize.
        """
        ...

    @abstractmethod
    def validate_config(self, config: dict) -> dict:
        """
        Validate and normalize a sport_config dict.
        Raises ValueError if config is invalid.
        Returns the cleaned config.
        """
        ...

    @abstractmethod
    def check_set_winner(self, score_p1: int, score_p2: int, config: dict) -> Optional[int]:
        """
        Given current set scores, return the winner (1 or 2) or None if set is ongoing.
        For sports without sets (football, cricket), this is not used.
        """
        ...

    @abstractmethod
    def check_match_winner(self, sets_won_p1: int, sets_won_p2: int, config: dict) -> Optional[int]:
        """
        Given sets won by each side, return the match winner (1 or 2) or None.
        For non-set sports, this uses different logic (e.g., goals for football).
        """
        ...

    @abstractmethod
    def get_server(self, score_p1: int, score_p2: int, first_server: int, config: dict) -> Optional[int]:
        """
        Return which position (1 or 2) is currently serving.
        Returns None if serving doesn't apply to this sport.
        """
        ...

    def validate_score(self, score_p1: int, score_p2: int, config: dict, **ctx) -> None:
        """
        Reject scores the sport's rules cannot produce. Raise ValueError with a
        user-facing message. Default: accept anything (sports override this).
        ctx may carry: innings, balls, live_state.
        """
        return None

    @abstractmethod
    def get_match_summary(self, match) -> dict:
        """
        Given a Match ORM object (with participants and sets loaded),
        return a summary dict for the public API.
        """
        ...
