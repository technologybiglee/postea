import { Response, NextFunction } from 'express';
import { PostStatus } from '@prisma/client';
import { prisma } from '../prisma/client';
import { AuthRequest } from '../types';
import { POST_INCLUDE, VALID_STATUSES, flattenTags } from './posts.controller';
import { publishDuePosts } from '../utils/scheduler';

const LIST_SIZE = 5;
const TOP_TAGS = 10;

/**
 * GET /api/dashboard
 *
 * Summary metrics for the authenticated user's company, in one call.
 */
export const getDashboard = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const companyId = req.user!.companyId as number;

    // Publish due scheduled posts first so counts reflect the real status.
    await publishDuePosts(companyId);

    const [
      totalPosts,
      totalCategories,
      totalTags,
      statusGroups,
      categories,
      tags,
      upcomingScheduled,
      recentPosts,
    ] = await Promise.all([
      prisma.post.count({ where: { companyId } }),
      prisma.category.count({ where: { companyId } }),
      prisma.tag.count({ where: { companyId } }),
      prisma.post.groupBy({ by: ['status'], where: { companyId }, _count: { _all: true } }),
      prisma.category.findMany({
        where: { companyId },
        select: { id: true, name: true, _count: { select: { posts: true } } },
      }),
      prisma.tag.findMany({
        where: { companyId, posts: { some: {} } },
        select: { id: true, name: true, _count: { select: { posts: true } } },
        orderBy: [{ posts: { _count: 'desc' } }, { name: 'asc' }],
        take: TOP_TAGS,
      }),
      prisma.post.findMany({
        where: { companyId, status: 'scheduled' },
        include: POST_INCLUDE,
        orderBy: { scheduledAt: 'asc' },
        take: LIST_SIZE,
      }),
      prisma.post.findMany({
        where: { companyId },
        include: POST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: LIST_SIZE,
      }),
    ]);

    const postsByStatus = Object.fromEntries(VALID_STATUSES.map((s) => [s, 0])) as Record<PostStatus, number>;
    for (const group of statusGroups) postsByStatus[group.status] = group._count._all;

    const postsByCategory = categories
      .map((c) => ({ id: c.id, name: c.name, count: c._count.posts }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const topTags = tags.map((t) => ({ id: t.id, name: t.name, count: t._count.posts }));

    res.json({
      success: true,
      data: {
        totals: { posts: totalPosts, categories: totalCategories, tags: totalTags },
        postsByStatus,
        postsByCategory,
        topTags,
        upcomingScheduled: upcomingScheduled.map(flattenTags),
        recentPosts: recentPosts.map(flattenTags),
      },
    });
  } catch (error) {
    next(error);
  }
};
