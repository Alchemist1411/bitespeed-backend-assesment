import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import { PrismaClient, Contact, LinkPrecedence } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

interface IdentifyRequest {
  email?: string;
  phoneNumber?: string;
}

interface IdentifyResponse {
  contact: {
    primaryContactId: number;
    emails: string[];
    phoneNumbers: string[];
    secondaryContactIds: number[];
  };
  error?: string;
}

app.post(
  "/identify",
  async (
    req: Request<{}, {}, IdentifyRequest>,
    res: Response<IdentifyResponse>
  ) => {
    const { email, phoneNumber } = req.body;

    try {
      let primaryContact: Contact | null = null;
      let secondaryContactIds: number[] = [];

      if (email) {
        primaryContact = await prisma.contact.findFirst({
          where: {
            OR: [{ email }, { phoneNumber }],
            linkPrecedence: LinkPrecedence.primary,
          },
        });
      } else if (phoneNumber) {
        primaryContact = await prisma.contact.findFirst({
          where: {
            phoneNumber,
            linkPrecedence: LinkPrecedence.primary,
          },
        });
      }

      if (!primaryContact) {
        primaryContact = await prisma.contact.create({
          data: {
            email,
            phoneNumber,
            linkPrecedence: LinkPrecedence.primary,
          },
        });
      }

      if (primaryContact) {
        const secondaryContacts = await prisma.contact.findMany({
          where: {
            linkedId: primaryContact.id,
            linkPrecedence: LinkPrecedence.secondary,
          },
        });

        secondaryContactIds = secondaryContacts.map((contact) => contact.id);
      }

      const uniqueEmails = Array.from(
        new Set(
          [primaryContact?.email, ...(email ? [email] : [])].filter(Boolean)
        )
      ) as string[];
      const uniquePhoneNumbers = Array.from(
        new Set(
          [
            primaryContact?.phoneNumber,
            ...(phoneNumber ? [phoneNumber] : []),
          ].filter(Boolean)
        )
      ) as string[];

      const response: IdentifyResponse = {
        contact: {
          primaryContactId: primaryContact?.id || 0,
          emails: uniqueEmails,
          phoneNumbers: uniquePhoneNumbers,
          secondaryContactIds,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      console.error("Error processing identify request:", error);
      res.status(500).json({
        error: "Internal server error",
        contact: {
          primaryContactId: 0,
          emails: [],
          phoneNumbers: [],
          secondaryContactIds: [],
        },
      });
    }
  }
);

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
