import { z } from "zod";
import { getTenantPoolById } from "../db/get-tenant-dbpool.js";

export const checkAvailabilityTool = {
  name: "check_availability",
  description: "Check room availability for a hotel",
  inputSchema: z.object({
    orgId: z.number(),
    propertyId: z.number(),
    roomType: z.optional(z.string()),
    checkIn: z.string(),
    checkOut: z.string(),
  }),

  async execute(input) {
    return await checkAvailability(input);
  },
};

async function checkAvailability({
  orgId,
  propertyId,
  roomType,
  checkIn,
  checkOut,
}) {
  console.log(orgId);
  const pool = await getTenantPoolById(orgId);

  const query = `SELECT 
        opr.roomclass_id,
        opr.view_id,
        orc.custom_name,
        cv.roomview,
        orc.maxadultcount,
        orc.maxchildcount,
        opw.web_price_id,
        ohrps.id,
        COUNT(DISTINCT opr.id) AS roomcount,
        json_agg(
        DISTINCT jsonb_build_object(
          'id', opr.id,
          'roomno_text', opr.roomno_text
        )
      ) AS rooms,
        json_agg(
          DISTINCT jsonb_build_object(
            'web_price_id', opw.web_price_id,
            'schedule_id', ohrps.id,
        'ro_price', oprp.roprice
          )
        )
        FILTER (WHERE opw.web_price_id IS NOT NULL
      AND opr.roomclass_id = oprp.roomclass_id
      AND opr.view_id = oprp.view_id) AS prices
    FROM operation_rooms opr
    INNER JOIN operation_roomreclass orc
        ON opr.roomclass_id = orc.id
    INNER JOIN core_data.core_view cv
        ON opr.view_id = cv.id
    LEFT JOIN operation_room_prices_web opw
        ON opw.property_id = opr.property_id
      AND daterange(opw.from_date, opw.to_date, '[]')
           && daterange($2, $3, '[]')
    LEFT JOIN operation_hotelroompriceshedules ohrps
        ON ohrps.id = opw.schedule_id
    LEFT JOIN operation_roomprices oprp
        ON oprp.shedule_id = ohrps.id
    WHERE opr.property_id = $1
    AND opr.id NOT IN (
        SELECT bd.room_id
        FROM operation_bookingdetails bd
        JOIN operation_booking ob ON ob.id = bd.booking_id
        WHERE ob.checkindate < $3
          AND ob.checkoutdate > $2
          AND ob.property_id = $1
          AND (ob.cancelled = FALSE OR ob.cancelled IS NULL)
    )
    AND opr.id NOT IN (
        SELECT orad.room_id
        FROM operation_room_availability orv
        JOIN operation_room_availability_details orad
          ON orv.id = orad.room_availability_id
        WHERE (
            $3 BETWEEN orv.startdate AND orv.enddate
            OR $2 BETWEEN orv.startdate AND orv.enddate
        )
        AND orv.propertyid = $1
    )
    GROUP BY
    opr.roomclass_id,
    opr.view_id,
    orc.custom_name,
    cv.roomview,
    orc.maxadultcount,
    orc.maxchildcount,
    opw.web_price_id, 
    ohrps.id;`;

  const values = [propertyId, checkIn, checkOut];

  const { rows } = await pool.query(query, values);

  return rows;
}
