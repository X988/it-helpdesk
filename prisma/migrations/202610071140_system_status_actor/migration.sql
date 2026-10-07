-- Background jobs have no human actor. Preserve that fact instead of attributing
-- automatic transitions to the ticket requester.
ALTER TABLE "TicketStatusHistory" ALTER COLUMN "actorId" DROP NOT NULL;
